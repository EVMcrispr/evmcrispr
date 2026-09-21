import { describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvml } from "@evmcrispr/core";
import { custom, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import Http from "../../../../modules/http/src";
import Safe from "../../../../modules/safe/src";
import { stringifySafeTransaction } from "../../../../modules/safe/src/utils/offline";
import { transactionPackage } from "../../../../modules/safe/src/utils/packages";
import { buildSafeTx } from "../../../../modules/safe/src/utils/safeTx";
import { downloadOutput } from "../../src/utils/download-output";

describe("explicit input and printed output", () => {
  it("runs identical import/review/sign/merge scripts on CLI and browser hosts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "evml-file-hosts-"));
    const account = privateKeyToAccount(toHex(1n, { size: 32 }));
    const safe = "0x1111111111111111111111111111111111111111";
    const pkg = stringifySafeTransaction(
      transactionPackage(
        1,
        safe,
        buildSafeTx([{ to: safe, value: 9007199254740993n }], 0n),
      ),
    );
    const tag = createEvml({
      account: account.address,
      transports: {
        1: custom({
          request: async () => {
            throw new Error("RPC forbidden");
          },
        }),
      },
    }).use(Http, Safe);
    const source = `load http [@fetch]
load safe
set $tx @fetch(stdin:)
safe:verify ${safe} $tx --no-api true --offline true --as $review
sign $sig --typed @http:json($review typedData)
set $signed @safe:merge($tx $sig)
print $signed
`;
    const script = join(directory, "sign.evml");
    await writeFile(script, source);
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const { id, method, params } = JSON.parse(body);
      expect(method).toBe("eth_signTypedData_v4");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: await account.signTypedData(JSON.parse(params[1])),
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as AddressInfo).port;
    try {
      let output = "";
      const logs: string[] = [];
      await tag
        .with({
          stdin: pkg,
          onLog: (s) => logs.push(s),
          onOutput: (s) => {
            output += `${s}\n`;
          },
        })
        .script(source)
        .execute(undefined, {
          handlers: {
            wallet: async (action) => {
              expect(logs.join("\n")).toContain("EIP-712 signing payload");
              expect(output).toBe("");
              return account.signTypedData(JSON.parse(action.params[1]));
            },
          },
        });
      const cli = Bun.spawn(
        [
          "bun",
          join(import.meta.dirname, "../../../../packages/cli/src/bin.ts"),
          "--experimental",
          "run",
          script,
          "--wallet-rpc",
          `http://127.0.0.1:${port}`,
          "--account",
          account.address,
        ],
        {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
          env: {
            ...process.env,
            EVMCRISPR_DEFAULT_CHAIN_ID: "1",
            EVMCRISPR_RPC_URL: "http://127.0.0.1:1",
          },
        },
      );
      cli.stdin.write(pkg);
      cli.stdin.end();
      const [stdout, stderr, exit] = await Promise.all([
        Bun.readableStreamToText(cli.stdout),
        Bun.readableStreamToText(cli.stderr),
        cli.exited,
      ]);
      expect(exit).toBe(0);
      expect(stderr).toContain("EIP-712 signing payload");
      expect(stdout).toBe(output);
      expect(JSON.parse(output).signatures).toHaveLength(1);
      expect(output).toContain("9007199254740993");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("downloads exactly the print stream, including empty prints and tables", async () => {
    let output = "";
    await createEvml({
      onOutput: (s) => {
        output += `${s}\n`;
      },
    })
      .script(
        'print "café 🚀"\nprint ""\nprint [1 2]\nprint "{\\"nonce\\":\\"9007199254740993\\"}"',
      )
      .execute(undefined);
    let exported: Blob | undefined;
    const create = spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:test";
    });
    const click = spyOn(
      HTMLAnchorElement.prototype,
      "click",
    ).mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("output.txt");
    });
    try {
      downloadOutput(output);
      expect(await exported!.text()).toBe(output);
      expect(output).toBe(
        'café 🚀\n\n|  |  |\n| --- | --- |\n| 1 | 2 |\n{"nonce":"9007199254740993"}\n',
      );
      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      create.mockRestore();
      click.mockRestore();
    }
  });
});
