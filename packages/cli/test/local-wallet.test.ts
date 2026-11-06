import { afterAll, describe, expect, it } from "bun:test";
import { recoverMessageAddress, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { confirmingAccount } from "../src/lib/local-signer";
import { localWallet } from "../src/lib/local-wallet";

// Anvil's account #1.
const KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const base = privateKeyToAccount(KEY);

// A node that, like anvil, would sign for an unlocked account: it records
// every method so the test sees nothing that signs reaches it.
const methods: string[] = [];
const node = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = (await req.json()) as any;
    methods.push(body.method);
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: body.method === "eth_chainId" ? "0x1" : `0x${"11".repeat(65)}`,
    });
  },
});
afterAll(() => node.stop(true));

function wallet(answer: boolean) {
  const summaries: string[] = [];
  const signer = confirmingAccount(base, async (summary) => {
    summaries.push(summary);
    return answer;
  });
  return {
    summaries,
    client: localWallet(signer, 1, `http://127.0.0.1:${node.port}`),
  };
}

const typed = {
  domain: { name: "Test", version: "1", chainId: 1 },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
    ],
    Note: [{ name: "text", type: "string" }],
  },
  primaryType: "Note",
  message: { text: "hello" },
};

describe("localWallet", () => {
  it("signs personal_sign through the confirmed signer", async () => {
    const { client, summaries } = wallet(true);
    const signature = (await client.request({
      method: "personal_sign",
      params: ["hi", base.address],
    } as any)) as `0x${string}`;
    expect(summaries[0]).toContain('"hi"');
    expect(await recoverMessageAddress({ message: "hi", signature })).toBe(
      base.address,
    );
  });

  it("signs eth_signTypedData_v4 through the confirmed signer", async () => {
    const { client, summaries } = wallet(true);
    const signature = (await client.request({
      method: "eth_signTypedData_v4",
      params: [base.address, JSON.stringify(typed)],
    } as any)) as `0x${string}`;
    expect(summaries[0]).toContain('{"text":"hello"}');
    expect(
      await recoverTypedDataAddress({ ...(typed as any), signature }),
    ).toBe(base.address);
  });

  it("does not sign when confirmation is refused", async () => {
    const { client } = wallet(false);
    await expect(
      client.request({
        method: "personal_sign",
        params: ["hi", base.address],
      } as any),
    ).rejects.toThrow("Not signed");
  });

  it("refuses other signing methods and other accounts", async () => {
    const { client, summaries } = wallet(true);
    for (const method of [
      "eth_signTransaction",
      "eth_signTypedData",
      "eth_signTypedData_v3",
      "personal_ecRecover",
      "wallet_sendCalls",
      "wallet_getCapabilities",
    ])
      await expect(
        client.request({ method, params: [] } as any),
      ).rejects.toThrow(`${method} is not available with the local key`);
    await expect(
      client.request({
        method: "personal_sign",
        params: ["hi", "0x1111111111111111111111111111111111111111"],
      } as any),
    ).rejects.toThrow("other than the local key");
    expect(summaries).toEqual([]);
  });

  it("answers accounts and switches only to the run's chain", async () => {
    const { client } = wallet(true);
    expect(await client.request({ method: "eth_accounts" } as any)).toEqual([
      base.address,
    ]);
    expect(await client.getAddresses()).toEqual([base.address]);
    await client.switchChain({ id: 1 });
    await expect(client.switchChain({ id: 100 })).rejects.toThrow(
      "The local key signs on one chain per run (Ethereum): set EVMCRISPR_DEFAULT_CHAIN_ID",
    );
  });

  it("forwards reads to the node and nothing that signs", async () => {
    const { client } = wallet(true);
    expect(await client.getChainId()).toBe(1);
    expect(methods).toContain("eth_chainId");
    expect(
      methods.filter((m) =>
        /^(eth_sign|personal_|wallet_|eth_sendTransaction|eth_accounts)/.test(
          m,
        ),
      ),
    ).toEqual([]);
  });
});
