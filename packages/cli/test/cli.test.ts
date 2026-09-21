import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dirname, "../src/bin.ts");

function run(
  args: string[],
  options?: {
    input?: string;
    cwd?: string;
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
      cwd: options?.cwd,
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

  describe("run", () => {
    it("reads piped data separately from the script and prints clean UTF-8 output", async () => {
      tmpDir ??= mkdtempSync(join(tmpdir(), "evmcrispr-run-"));
      const script = join(tmpDir, "script with spaces.evml");
      writeFileSync(script, "load http [@fetch]\nprint @fetch(stdin:)");
      for (const payload of [
        "",
        '{"nonce":"9007199254740993","name":"café 🚀"}',
        "line one\nline two\n",
      ]) {
        const result = await run(["run", script], { input: payload });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe(`${payload}\n`);
        expect(result.stderr).toBe("");
      }
    });
    it("reserves stdin for source with run - and keeps errors off stdout", async () => {
      const result = await run(["run", "-"], {
        input: "load http [@fetch]\nprint @fetch(stdin:)",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("stdin is used for the script itself");
      const removed = await run(["run", "-", "--store-dir", "/tmp"], {
        input: "print hello",
      });
      expect(removed.exitCode).toBe(1);
    });
    it("does not allow EVML to read paths or file URLs", async () => {
      tmpDir ??= mkdtempSync(join(tmpdir(), "evmcrispr-run-"));
      const privateFile = join(tmpDir, "private.txt");
      writeFileSync(privateFile, "must not be read");
      for (const path of [
        "./private.txt",
        privateFile,
        `file://${privateFile}`,
      ]) {
        const result = await run(["run", "-"], {
          input: `load http [@fetch]\nprint @fetch(${JSON.stringify(path)})`,
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("expects an HTTP(S) URL");
        expect(result.stderr).not.toContain("must not be read");
      }
    });
    it("validates stdin scripts without receiving any input", async () => {
      const result = await run(["validate", "-"], {
        input: "load http [@fetch]\nprint @fetch(stdin:)",
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).valid).toBe(true);
    });
    it("requires both an external wallet endpoint and its account", async () => {
      const result = await run(
        ["run", "-", "--wallet-rpc", "http://127.0.0.1:1"],
        { input: "print hello" },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("must be supplied together");
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
