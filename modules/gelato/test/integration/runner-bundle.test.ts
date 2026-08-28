import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { anvilUrl } from "../../../../scripts/anvil-config";
import { MAX_BUNDLE_BYTES } from "../../src/utils/tgz";

const USDC = "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83";
const EXECUTOR = "0x4F2083f5fBede34C2714aFfb3105539775f7FE64";

const gelatoDir = join(import.meta.dirname, "../..");
const scratch = process.env.TMPDIR ?? "/tmp";

describe("EVML runner bundle", () => {
  it("fits Gelato's archive limit, ships no excluded module and builds deterministically", async () => {
    // The publish script builds twice, compares the archives and fails
    // above the limit; run it the way a release does.
    const file = join(scratch, `evmcrispr-runner-${process.pid}.js`);
    const build = Bun.spawn(
      ["bun", "scripts/publish-runner.ts", "--dry-run", "--out", file],
      { cwd: gelatoDir, stdout: "pipe", stderr: "pipe" },
    );
    const [code, out, err] = await Promise.all([
      build.exited,
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
    ]);
    expect(err).toBe("");
    expect(code).toBe(0);
    const archive = out.match(/archive (\d+) KiB/);
    expect(archive).not.toBeNull();
    expect(Number(archive![1]) * 1024).toBeLessThan(MAX_BUNDLE_BYTES);

    const indexJs = await Bun.file(file).text();
    // sim is stubbed out: none of its fork plumbing ships
    expect(indexJs.includes("anvil_impersonateAccount")).toBe(false);
    // the process shim runs first and turns the experimental flag on
    expect(
      indexJs.startsWith(
        'try{Object.defineProperty(globalThis,"process",{value:{env:{VITE_PUBLIC_EXPERIMENTAL:"true"}',
      ),
    ).toBe(true);

    // Run the bundle under Deno the way the sandbox does and drive one
    // execution through the protocol: readiness probe, start event with a
    // script reading anvil through --rpc, result event, clean exit.
    const deno =
      Bun.which("deno") ??
      (existsSync(join(process.env.HOME ?? "", ".deno/bin/deno"))
        ? join(process.env.HOME ?? "", ".deno/bin/deno")
        : undefined);
    if (!deno) return;
    const port = 18000 + (process.pid % 1000);
    const mount = "evmcrispr-test";
    const proc = Bun.spawn(
      [
        deno,
        "run",
        "--no-remote",
        "--no-npm",
        "--allow-net",
        "--allow-env=WEB3_FUNCTION_SERVER_PORT,WEB3_FUNCTION_MOUNT_PATH",
        file,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          WEB3_FUNCTION_SERVER_PORT: String(port),
          WEB3_FUNCTION_MOUNT_PATH: mount,
        },
      },
    );
    try {
      const url = `http://127.0.0.1:${port}/${mount}`;
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        ready = await fetch(url)
          .then((r) => r.ok)
          .catch(() => false);
        if (!ready) await Bun.sleep(100);
      }
      expect(ready).toBe(true);
      const reply = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          data: {
            operation: "onRun",
            context: {
              gelatoArgs: { chainId: 100, gasPrice: "1" },
              rpcProviderUrl: "http://127.0.0.1:1/unused",
              userArgs: {
                script: `exec ${USDC} approve(address,uint256) @sender 1`,
                account: TEST_ACCOUNT_ADDRESS,
                sender: EXECUTOR,
                rpcUrl: anvilUrl(),
              },
              secrets: {},
              storage: {},
            },
          },
        }),
      }).then((r) => r.json());
      expect(reply).toEqual({
        action: "result",
        data: {
          result: {
            canExec: true,
            callData: [{ to: USDC, data: expect.any(String) }],
          },
          storage: { state: "last", storage: {}, diff: {} },
          callbacks: { onFail: false, onSuccess: false },
        },
      });
      expect(reply.data.result.callData[0].data.toLowerCase()).toContain(
        EXECUTOR.slice(2).toLowerCase(),
      );
      const code = await Promise.race([
        proc.exited,
        Bun.sleep(5_000).then(() => "still running" as const),
      ]);
      expect(code).toBe(0);
      expect(await new Response(proc.stderr).text()).toBe("");
    } finally {
      proc.kill();
    }
  }, 240_000);
});
