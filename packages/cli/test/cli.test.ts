import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dirname, "../src/bin.ts");

function run(
  args: string[],
  options?: {
    input?: string;
    timeout?: number;
    env?: Record<string, string | undefined>;
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const env: Record<string, string | undefined> = {
      ...process.env,
      NO_COLOR: "1",
      ...options?.env,
    };
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) delete env[key];
    }
    const proc = Bun.spawn(["bun", BIN, ...args], {
      stdin: options?.input != null ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: env as Record<string, string>,
    });

    if (options?.input != null) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      proc.kill();
    }, options?.timeout ?? 10_000);

    proc.exited.then(async (exitCode) => {
      clearTimeout(timer);
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      resolve({ stdout, stderr, exitCode });
    });
  });
}

describe("CLI", () => {
  let tmpDir: string;

  afterAll(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("no args", () => {
    it("prints usage and exits 0", async () => {
      const { stdout, exitCode } = await run([]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: evmcrispr");
      expect(stdout).toContain("simulate");
      expect(stdout).toContain("validate");
    });
  });

  describe("unknown command", () => {
    it("prints usage and exits 1", async () => {
      const { stdout, exitCode } = await run(["nonsense"]);
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Usage: evmcrispr");
    });
  });

  describe("validate", () => {
    it("exits 1 with no file argument", async () => {
      const { stderr, exitCode } = await run(["validate"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Usage: evmcrispr validate");
    });

    it("validates a correct script from a file", async () => {
      tmpDir = mkdtempSync(join(tmpdir(), "evmcrispr-test-"));
      const file = join(tmpDir, "valid.evml");
      writeFileSync(file, "set $x 42\nload aragonos\n");

      const { stdout, exitCode } = await run(["validate", file]);
      expect(exitCode).toBe(0);

      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toEqual([]);
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it("reports errors for an invalid script", async () => {
      tmpDir ??= mkdtempSync(join(tmpdir(), "evmcrispr-test-"));
      const file = join(tmpDir, "invalid.evml");
      writeFileSync(file, "unknown_cmd foo\n");

      const { stdout, exitCode } = await run(["validate", file]);
      expect(exitCode).toBe(1);

      const result = JSON.parse(stdout);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it("reads from stdin when file is -", async () => {
      const { stdout, exitCode } = await run(["validate", "-"], {
        input: "set $y 100",
      });
      expect(exitCode).toBe(0);

      const result = JSON.parse(stdout);
      expect(result.valid).toBe(true);
    });
  });

  describe("--experimental flag", () => {
    const script = "load safe\n";
    const envOff = { VITE_PUBLIC_EXPERIMENTAL: undefined };

    it("gates experimental modules by default", async () => {
      const { stdout, exitCode } = await run(["validate", "-"], {
        input: script,
        env: envOff,
      });
      expect(exitCode).toBe(1);

      const result = JSON.parse(stdout);
      expect(result.valid).toBe(false);
      expect(JSON.stringify(result.diagnostics)).toContain("experimental");
    });

    it("enables experimental modules with --experimental", async () => {
      const { stdout, exitCode } = await run(
        ["--experimental", "validate", "-"],
        {
          input: script,
          env: envOff,
        },
      );
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout).valid).toBe(true);
    });

    it("accepts the flag after the command", async () => {
      const { stdout, exitCode } = await run(
        ["validate", "--experimental", "-"],
        {
          input: script,
          env: envOff,
        },
      );
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout).valid).toBe(true);
    });
  });

  describe("simulate", () => {
    it("exits 1 with no file argument", async () => {
      const { stderr, exitCode } = await run(["simulate"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Usage: evmcrispr simulate");
    });
  });
});
