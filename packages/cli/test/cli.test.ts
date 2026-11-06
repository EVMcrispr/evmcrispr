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

// Anvil's account #1: its key must never reach any output.
const KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const keyOutputs: string[] = [];
function keyRun(...params: Parameters<typeof run>) {
  return run(...params).then((result) => {
    keyOutputs.push(result.stdout, result.stderr);
    return result;
  });
}

/** A JSON-RPC node answering what viem asks before it signs, recording
 *  every method and the raw transactions it is sent. */
function stubNode(chainId: number) {
  const methods: string[] = [];
  const raw: string[] = [];
  const answer = (method: string, params: any[]): unknown => {
    switch (method) {
      case "eth_chainId":
        return `0x${chainId.toString(16)}`;
      case "eth_blockNumber":
        return "0x10";
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_getBlockByNumber":
        return {
          number: "0x10",
          hash: `0x${"ab".repeat(32)}`,
          parentHash: `0x${"cd".repeat(32)}`,
          timestamp: "0x6553f100",
          baseFeePerGas: "0x1",
          gasLimit: "0x1c9c380",
          gasUsed: "0x0",
          transactions: [],
        };
      case "eth_estimateGas":
        return "0x5208";
      case "eth_maxPriorityFeePerGas":
      case "eth_gasPrice":
        return "0x1";
      case "eth_getCode":
      case "eth_call":
        return "0x";
      case "eth_getBalance":
        return "0xde0b6b3a7640000";
      case "eth_sendRawTransaction":
        raw.push(params[0]);
        return `0x${"12".repeat(32)}`;
      case "eth_getTransactionReceipt":
        return {
          transactionHash: params[0],
          blockHash: `0x${"ab".repeat(32)}`,
          blockNumber: "0x10",
          transactionIndex: "0x0",
          from: KEY_ACCOUNT.toLowerCase(),
          to: "0x1111111111111111111111111111111111111111",
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          effectiveGasPrice: "0x1",
          contractAddress: null,
          logs: [],
          logsBloom: `0x${"00".repeat(256)}`,
          status: "0x1",
          type: "0x2",
        };
      default:
        return null;
    }
  };
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const body = (await req.json()) as any;
      const one = (r: any) => {
        methods.push(r.method);
        return {
          jsonrpc: "2.0",
          id: r.id,
          result: answer(r.method, r.params ?? []),
        };
      };
      return Response.json(Array.isArray(body) ? body.map(one) : one(body));
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    methods,
    raw,
    stop: () => server.stop(true),
  };
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
      // Three runs of the CLI, the first of them cold: seconds each on a
      // CI runner, more than the default allows for the three.
    }, 30_000);
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
    it("cancels the run on Ctrl-C", async () => {
      const proc = Bun.spawn(["bun", BIN, "run", "-"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, NO_COLOR: "1" } as Record<string, string>,
      });
      proc.stdin.write('print "started"\nwait 60s\nprint "after"');
      proc.stdin.end();
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let stdout = "";
      let interrupted = false;
      const timer = setTimeout(() => proc.kill(), 10_000);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        stdout += decoder.decode(value);
        if (!interrupted && stdout.includes("started")) {
          interrupted = true;
          proc.kill("SIGINT");
        }
      }
      const exitCode = await proc.exited;
      clearTimeout(timer);
      const stderr = await new Response(proc.stderr).text();
      expect(exitCode).toBe(1);
      expect(stdout).not.toContain("after");
      expect(stderr).toContain("Cancelling…");
      expect(stderr).toContain("Execution cancelled");
    }, 20_000);
    it("cancels a send the wallet never answers on Ctrl-C", async () => {
      // Answers the chain id and holds every other request open, like a
      // wallet prompt nobody confirms.
      let hanging!: () => void;
      const reached = new Promise<void>((r) => {
        hanging = r;
      });
      const rpc = Bun.serve({
        port: 0,
        fetch: async (req) => {
          const body = (await req.json()) as { id?: number; method?: string };
          if (body.method === "eth_chainId")
            return Response.json({
              jsonrpc: "2.0",
              id: body.id,
              result: "0x1",
            });
          hanging();
          return new Promise<Response>(() => {});
        },
      });
      const url = `http://127.0.0.1:${rpc.port}`;
      const proc = Bun.spawn(
        [
          "bun",
          BIN,
          "run",
          "-",
          "--wallet-rpc",
          url,
          "--account",
          "0x000000000000000000000000000000000000dEaD",
        ],
        {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            NO_COLOR: "1",
            EVMCRISPR_DEFAULT_CHAIN_ID: "1",
            EVMCRISPR_RPC_URL_1: url,
          } as Record<string, string>,
        },
      );
      proc.stdin.write(
        'exec 0x1111111111111111111111111111111111111111 "transfer(address,uint256)" 0x2222222222222222222222222222222222222222 5\nprint "after"',
      );
      proc.stdin.end();
      const timer = setTimeout(() => proc.kill(), 10_000);
      await reached;
      proc.kill("SIGINT");
      const exitCode = await proc.exited;
      clearTimeout(timer);
      rpc.stop(true);
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      expect(exitCode).toBe(1);
      expect(stdout).not.toContain("after");
      expect(stderr).toContain("Cancelled");
      expect(stderr).toContain("Execution cancelled");
    }, 20_000);
    it("requires both an external wallet endpoint and its account", async () => {
      const result = await run(
        ["run", "-", "--wallet-rpc", "http://127.0.0.1:1"],
        { input: "print hello" },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("must be supplied together");
    });

    it("refuses the key together with --wallet-rpc", async () => {
      for (const flags of [
        ["--wallet-rpc", "http://127.0.0.1:1", "--account", KEY_ACCOUNT],
        ["--wallet-rpc", "http://127.0.0.1:1"],
        ["--account", KEY_ACCOUNT],
      ]) {
        const result = await keyRun(["run", "-", ...flags], {
          input: "print hello",
          env: { EVMCRISPR_PRIVATE_KEY: KEY },
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(
          "EVMCRISPR_PRIVATE_KEY cannot be used with --wallet-rpc or --account",
        );
      }
    });
    it("refuses a malformed key without echoing it", async () => {
      const result = await keyRun(["run", "-"], {
        input: "print hello",
        env: { EVMCRISPR_PRIVATE_KEY: `${KEY.slice(0, -1)}z` },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "EVMCRISPR_PRIVATE_KEY is not a private key",
      );
      expect(result.stderr).not.toContain(KEY.slice(2, -1));
    });
    it("rejects values after --yes and --size-by-simulation", async () => {
      const result = await keyRun(["run", "-", "--yes", "1"], {
        input: "print hello",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage: evmcrispr run");
    });
    it("refuses to sign without a terminal or --yes", async () => {
      const node = stubNode(1);
      try {
        const result = await keyRun(["run", "-"], {
          input: 'exec @me "f()"',
          env: {
            EVMCRISPR_PRIVATE_KEY: KEY,
            EVMCRISPR_DEFAULT_CHAIN_ID: "1",
            EVMCRISPR_RPC_URL: node.url,
          },
          timeout: 20_000,
        });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          "Refusing to sign without confirmation: run in a terminal or pass --yes",
        );
        expect(node.raw).toEqual([]);
      } finally {
        node.stop();
      }
    }, 30_000);
    it("signs with --yes after showing the transaction", async () => {
      const node = stubNode(1);
      try {
        const result = await keyRun(
          ["run", "-", "--yes", "--size-by-simulation"],
          {
            input: 'exec @me "f()"',
            env: {
              EVMCRISPR_PRIVATE_KEY: KEY,
              EVMCRISPR_DEFAULT_CHAIN_ID: "1",
              EVMCRISPR_RPC_URL: node.url,
            },
            timeout: 20_000,
          },
        );
        expect(result.stderr).toContain("Sign a transaction on Ethereum");
        expect(result.stderr).toContain(KEY_ACCOUNT);
        expect(result.exitCode).toBe(0);
        expect(node.raw).toHaveLength(1);
        const { recoverTransactionAddress } = await import("viem");
        expect(
          await recoverTransactionAddress({
            serializedTransaction: node.raw[0] as any,
          }),
        ).toBe(KEY_ACCOUNT);
      } finally {
        node.stop();
      }
    }, 30_000);
    it("never prints the key", () => {
      expect(keyOutputs.length).toBeGreaterThanOrEqual(12);
      for (const output of keyOutputs) {
        expect(output.toLowerCase()).not.toContain(KEY.slice(2));
      }
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
