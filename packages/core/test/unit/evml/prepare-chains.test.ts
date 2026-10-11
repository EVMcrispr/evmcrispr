import { describe, expect, it } from "bun:test";
import "../../setup.js";

import type { WalletClient } from "viem";
import { prepareChainsForScript } from "../../../src/evml/execute";
import { classifyError } from "../../../src/interpreter/classify";

const refusal = Object.assign(new Error("User rejected the request."), {
  code: 4001,
});

/** A wallet on mainnet that answers each change of chain from `answers`. */
function wallet(answers: (Error | null)[]) {
  let chainId = 1;
  const asked: number[] = [];
  const client = {
    getChainId: async () => chainId,
    switchChain: async ({ id }: { id: number }) => {
      asked.push(id);
      const answer = answers.shift();
      if (answer) throw answer;
      chainId = id;
    },
    addChain: async () => {},
  } as unknown as WalletClient;
  return { client, asked };
}

describe("prepareChainsForScript", () => {
  it("keeps its message when the wallet refuses, with the refusal as the cause", async () => {
    // Refused twice: the switch, and the switch after adding the chain.
    const { client } = wallet([refusal, refusal]);
    const failed = await prepareChainsForScript(client, "switch gnosis").then(
      () => null,
      (error: Error) => error,
    );
    expect(failed?.message).toBe(
      "Wallet only supports mainnet, but the script targets gnosis.",
    );
    expect(classifyError(failed).kind).toBe("rejected");
  });

  it("lets a host hold a change of chain and ask again", async () => {
    const { client, asked } = wallet([refusal, refusal, null]);
    const held: number[] = [];
    await prepareChainsForScript(
      client,
      "switch gnosis",
      undefined,
      async (chainId, align) => {
        held.push(chainId);
        await align().catch(() => align());
      },
    );
    expect(held).toEqual([100]);
    expect(asked).toEqual([100, 100, 100]);
    expect(await client.getChainId()).toBe(100);
  });
});
