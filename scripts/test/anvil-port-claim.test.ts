import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ANVIL_PORT_ENV,
  anvilLockDir,
  anvilPort,
  anvilPortLock,
  checkLockDir,
  claimAnvilPort,
  claimedByAnotherRunner,
  claimLock,
} from "../anvil-config";
import { runWithAnvilPort } from "../with-anvil";

// Outside the runner's range (8545..8560), so no real runner holds it.
const PORT = 9_871;
const DEAD_PID = 2 ** 22 + 7; // above Linux's pid_max default

const claim = (pid: number) => writeFileSync(anvilPortLock(PORT), String(pid));
const saved = process.env[ANVIL_PORT_ENV];

beforeAll(() => mkdirSync(dirname(anvilPortLock(PORT)), { recursive: true }));

afterEach(() => {
  rmSync(anvilPortLock(PORT), { force: true });
  if (saved === undefined) delete process.env[ANVIL_PORT_ENV];
  else process.env[ANVIL_PORT_ENV] = saved;
});

describe("a bare test process never uses a runner's anvil", () => {
  it("leaves alone a port a live runner claimed", () => {
    delete process.env[ANVIL_PORT_ENV];
    claim(process.ppid);
    expect(claimedByAnotherRunner(PORT)).toBe(true);
  });

  it("may replace it when nobody claimed the port, or its claimer is gone", () => {
    delete process.env[ANVIL_PORT_ENV];
    expect(claimedByAnotherRunner(PORT)).toBe(false);
    claim(DEAD_PID);
    expect(claimedByAnotherRunner(PORT)).toBe(false);
  });

  it("may replace it when it claimed the port itself", () => {
    delete process.env[ANVIL_PORT_ENV];
    claim(process.pid);
    expect(claimedByAnotherRunner(PORT)).toBe(false);
  });
});

describe("the port a test process uses", () => {
  it("is the one its runner exported", () => {
    process.env[ANVIL_PORT_ENV] = String(PORT);
    expect(anvilPort()).toBe(PORT);
    expect(claimAnvilPort()).toBeUndefined();
    expect(process.env[ANVIL_PORT_ENV]).toBe(String(PORT));
  });

  it("is its own when nobody exported one: claimed for it, then released", () => {
    delete process.env[ANVIL_PORT_ENV];
    const release = claimAnvilPort();
    expect(release).toBeFunction();
    const port = anvilPort();
    expect(process.env[ANVIL_PORT_ENV]).toBe(String(port));
    expect(readFileSync(anvilPortLock(port), "utf8")).toBe(String(process.pid));
    release!();
    expect(existsSync(anvilPortLock(port))).toBe(false);
  });
});

describe("a run under with-anvil", () => {
  it("gives every process of the run one port, claimed by the run, released after", async () => {
    delete process.env[ANVIL_PORT_ENV];
    const out = join(tmpdir(), `with-anvil-${process.pid}.txt`);
    const code = await runWithAnvilPort(
      [
        "bun",
        "-e",
        `require("node:fs").writeFileSync(${JSON.stringify(out)}, process.env.${ANVIL_PORT_ENV} + " " + require("node:fs").readFileSync(${JSON.stringify(anvilPortLock(0)).replace("0.lock", '" + process.env.' + ANVIL_PORT_ENV + ' + ".lock')}, "utf8"))`,
      ],
      { startAnvil: false },
    );
    expect(code).toBe(0);
    const [port, owner] = readFileSync(out, "utf8").split(" ");
    rmSync(out);
    expect(Number(owner)).toBe(process.pid);
    expect(existsSync(anvilPortLock(Number(port)))).toBe(false);
    expect(process.env[ANVIL_PORT_ENV]).toBeUndefined();
  });
});

describe("the lock directory", () => {
  it("is this user's own: a real directory, owned by them, closed to others", () => {
    const dir = anvilLockDir();
    const st = lstatSync(dir);
    expect(st.isDirectory()).toBe(true);
    expect(st.isSymbolicLink()).toBe(false);
    expect(st.uid).toBe(process.getuid!());
    expect(st.mode & 0o077).toBe(0);
  });

  it("refuses a directory someone else could write to", () => {
    const dir = join(tmpdir(), `anvil-lock-test-${process.pid}`);
    mkdirSync(dir, { mode: 0o777 });
    chmodSync(dir, 0o777);
    try {
      expect(() => checkLockDir(dir)).toThrow(/not private/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reclaims a stale lock by replacing it, never writing through it", () => {
    const target = join(tmpdir(), `anvil-lock-target-${process.pid}`);
    writeFileSync(target, "untouched");
    rmSync(anvilPortLock(PORT), { force: true });
    symlinkSync(target, anvilPortLock(PORT));
    try {
      expect(claimLock(PORT)).toBe(true);
      expect(readFileSync(target, "utf8")).toBe("untouched");
      expect(lstatSync(anvilPortLock(PORT)).isSymbolicLink()).toBe(false);
      expect(readFileSync(anvilPortLock(PORT), "utf8")).toBe(
        String(process.pid),
      );
    } finally {
      rmSync(target, { force: true });
    }
  });
});
