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

  it("starts on the chain of a leading bare switch", async () => {
    const { client, asked } = wallet([null, null]);
    await prepareChainsForScript(client, "switch gnosis\nswitch optimism");
    expect(asked).toEqual([100, 10, 100]);
    expect(await client.getChainId()).toBe(100);
  });

  it("prepares the chain of a block-form switch and ends on the start chain", async () => {
    const { client, asked } = wallet([null, null]);
    await prepareChainsForScript(
      client,
      "switch gnosis --as @me (\n  print 1\n)\nprint 2",
    );
    // The block puts the chain back: the script starts, and ends, on mainnet.
    expect(asked).toEqual([100, 1]);
    expect(await client.getChainId()).toBe(1);
  });

  it("prepares a block-form switch nested in other blocks", async () => {
    const { client, asked } = wallet([null, null]);
    await prepareChainsForScript(
      client,
      "if true (\n  switch optimism (\n    print 1\n  )\n)",
    );
    expect(asked).toEqual([10, 1]);
  });

  it("asks nothing for a switch that only names an account", async () => {
    const { client, asked } = wallet([]);
    await prepareChainsForScript(client, "switch --as @me (\n  print 1\n)");
    expect(asked).toEqual([]);
  });

  it("prepares the chain sim:fork --on names", async () => {
    const { client, asked } = wallet([null, null]);
    await prepareChainsForScript(
      client,
      "load sim\nsim:fork --on gnosis --block-number 123 (\n  print 1\n)",
    );
    expect(asked).toEqual([100, 1]);
  });

  it("prepares the chain of a bare switch inside a block, and ends on the start chain", async () => {
    const { client, asked } = wallet([null, null, null]);
    await prepareChainsForScript(
      client,
      "if true (\n  switch gnosis\n)\nload sim\nsim:fork (\n  switch optimism\n)",
    );
    expect(asked).toEqual([100, 10, 1]);
  });

  it("prepares the chains of bare switches in a loop and in a def body", async () => {
    const { client, asked } = wallet([null, null, null]);
    await prepareChainsForScript(
      client,
      'loop $i of [1 2] (\n  switch gnosis\n)\ndef there "" (\n  switch optimism\n)\nthere',
    );
    expect(asked).toEqual([100, 10, 1]);
  });
});
