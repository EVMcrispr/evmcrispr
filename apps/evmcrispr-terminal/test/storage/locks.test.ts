import { expect, test } from "bun:test";
import { LockTable, localLocks } from "../../src/storage/locks";

test("exclusive, shared, waiting, release", async () => {
  const table = new LockTable();
  const [a, b] = [localLocks(table), localLocks(table)];
  const held = await a.tryHold("run");
  expect(held).not.toBeNull();
  expect(await b.tryHold("run")).toBeNull();
  expect(await b.isHeld("run")).toBe(true);
  let got = false;
  const waiting = b.hold("run").then((r) => {
    got = true;
    return r;
  });
  await Promise.resolve();
  expect(got).toBe(false);
  held!();
  held!();
  (await waiting)();
  expect(await a.isHeld("run")).toBe(false);
  const s1 = await a.share("open");
  const s2 = await b.share("open");
  expect(await a.tryHold("open")).toBeNull();
  s1();
  expect(await a.isHeld("open")).toBe(true);
  s2();
  expect(await a.isHeld("open")).toBe(false);
});
