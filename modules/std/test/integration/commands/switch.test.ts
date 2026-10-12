import "../../setup";
import { describe, expect, it } from "bun:test";
import type { Action, WalletAction } from "@evmcrispr/sdk";
import { BindingsSpace, isWalletAction } from "@evmcrispr/sdk";
import { getPublicClient, TEST_ACCOUNT_ADDRESS } from "@evmcrispr/test-utils";
import { createInterpreter, describeCommand } from "@evmcrispr/test-utils/evml";

const OTHER_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TARGET = "0x44fA8E6f47987339850636F88629646662444217";

const walletAction = (chainId: string): WalletAction => ({
  type: "wallet",
  method: "wallet_switchEthereumChain",
  params: [{ chainId }],
});

describeCommand("switch", {
  describeName: "Std > commands > switch [chain] [--as account] [( … )]",
  cases: [
    {
      name: "should return a wallet_switchEthereumChain action for a numeric chain ID",
      script: "switch 100",
      expectedActions: [walletAction("0x64")],
    },
    {
      name: "should resolve a chain name to its chain ID",
      script: "switch gnosis",
      expectedActions: [walletAction("0x64")],
    },
    {
      name: "should resolve mainnet chain name",
      script: "switch mainnet",
      expectedActions: [walletAction("0x1")],
    },
    {
      name: "should resolve a camelCase chain name",
      script: "switch polygonZkEvm",
      expectedActions: [walletAction("0x44d")],
    },
    {
      name: "should work with numeric chain ID as string",
      script: "switch 1",
      expectedActions: [walletAction("0x1")],
    },
    {
      name: "block form: enters the chain, runs the block and puts the chain back",
      script: `switch optimism (
  exec ${TARGET} "foo()"
)`,
      validate: async (actions, interpreter) => {
        expect(actions).toHaveLength(3);
        expect(actions[0]).toEqual(walletAction("0xa"));
        expect((actions[1] as { to?: string }).to).toBe(TARGET);
        expect(actions[2]).toEqual(walletAction("0x64"));
        expect(await interpreter.evm.getChainId()).toBe(100);
      },
    },
    {
      name: "block form: nests, each level putting back what it found",
      script: `switch optimism (
  switch mainnet (
    set $x 1
  )
)`,
      expectedActions: [
        walletAction("0xa"),
        walletAction("0x1"),
        walletAction("0xa"),
        walletAction("0x64"),
      ],
    },
    {
      name: "--as the connected account changes nothing, bare or with a block",
      script: `switch --as ${TEST_ACCOUNT_ADDRESS}
switch --as ${TEST_ACCOUNT_ADDRESS} (
  set $inside @me
)`,
      expectedActions: [],
      validate: (_actions, interpreter) => {
        expect(interpreter.getBinding("$inside", BindingsSpace.USER)).toBe(
          TEST_ACCOUNT_ADDRESS,
        );
      },
    },
    {
      name: "a chain and --as together",
      script: `switch optimism --as ${TEST_ACCOUNT_ADDRESS} (
  set $x 1
)`,
      expectedActions: [walletAction("0xa"), walletAction("0x64")],
    },
    {
      name: "bare inside a block: moves until the end of that block, then the chain is back",
      script: `if true (
  exec ${TARGET} "foo()"
  switch optimism
  exec ${TARGET} "foo()"
)
exec ${TARGET} "foo()"`,
      validate: async (actions, interpreter) => {
        expect(actions).toHaveLength(5);
        expect(actions[1]).toEqual(walletAction("0xa"));
        expect(actions[3]).toEqual(walletAction("0x64"));
        expect(await interpreter.evm.getChainId()).toBe(100);
      },
    },
    {
      name: "bare inside a loop body: every iteration starts from the enclosing chain",
      script: `loop $i of [1 2] (
  switch optimism
)`,
      expectedActions: [
        walletAction("0xa"),
        walletAction("0x64"),
        walletAction("0xa"),
        walletAction("0x64"),
      ],
    },
    {
      name: "bare inside a def body: the caller's chain is untouched after the call",
      script: `def onoptimism "" (
  switch optimism
)
onoptimism`,
      validate: async (actions, interpreter) => {
        expect(actions).toEqual([walletAction("0xa"), walletAction("0x64")]);
        expect(await interpreter.evm.getChainId()).toBe(100);
      },
    },
    {
      name: "bare inside a def body that returns early: the caller's chain is untouched",
      script: `def onoptimism "" (
  switch optimism
  def return
)
onoptimism`,
      validate: async (_actions, interpreter) => {
        expect(await interpreter.evm.getChainId()).toBe(100);
      },
    },
    {
      name: "bare inside a block-form switch: ends with that block",
      script: `switch optimism (
  switch mainnet
)`,
      validate: async (actions, interpreter) => {
        expect(actions).toEqual([
          walletAction("0xa"),
          walletAction("0x1"),
          walletAction("0x64"),
        ]);
        expect(await interpreter.evm.getChainId()).toBe(100);
      },
    },
    {
      name: "two bare switches in one block: one move back, to where the block started",
      script: `if true (
  switch optimism
  switch mainnet
)`,
      expectedActions: [
        walletAction("0xa"),
        walletAction("0x1"),
        walletAction("0x64"),
      ],
    },
    {
      name: "two top-level bare switches both move, and nothing moves back",
      script: `switch optimism
switch mainnet`,
      validate: async (actions, interpreter) => {
        expect(actions).toEqual([walletAction("0xa"), walletAction("0x1")]);
        expect(await interpreter.evm.getChainId()).toBe(1);
      },
    },
    {
      name: "a loop break through the block still puts the chain back",
      script: `loop $i of [1 2] (
  switch optimism (
    loop break
  )
)`,
      validate: async (actions, interpreter) => {
        expect(actions).toEqual([walletAction("0xa"), walletAction("0x64")]);
        expect(await interpreter.evm.getChainId()).toBe(100);
      },
    },
  ],
  docCases: [
    {
      description: "Switch by chain name",
      code: `switch gnosis`,
    },
    {
      description: "Testnets and multi-word chains use camelCase viem names",
      code: `switch baseSepolia`,
    },
    {
      description: "Switch by chain ID",
      code: `switch 137`,
    },
    {
      description:
        "Run a block on another chain; the chain is put back when it ends",
      // Literal: generated docs take this text as written.
      code: `switch optimism (
  exec 0x44fA8E6f47987339850636F88629646662444217 "foo()"
)`,
    },
  ],
  errorCases: [
    {
      name: "should fail when receiving an unknown chain name",
      script: "switch fakechainname",
      error: "must be a chain id or a camelCase viem chain name",
    },
    {
      name: "should fail with neither a chain nor --as",
      script: "switch",
      error: "switch needs a chain, --as <address>, or both",
    },
    {
      name: "should fail with neither a chain nor --as around a block",
      script: `switch (
  set $x 1
)`,
      error: "switch needs a chain, --as <address>, or both",
    },
    {
      name: "inside a batch, a bare switch is refused",
      script: `batch (
  switch optimism
)`,
      error: 'command "switch" cannot be used inside batch',
    },
    {
      name: "inside a batch, the block form is refused",
      script: `batch (
  switch optimism (
    exec ${TARGET} "foo()"
  )
)`,
      error: 'command "switch" cannot be used inside batch',
    },
    {
      name: "inside a smart batch, a bare switch is refused",
      script: `batch !(
  switch optimism
)`,
      error: "cannot run inside an atomic batch",
    },
    {
      name: "inside a smart batch, the block form is refused",
      script: `batch !(
  switch optimism (
    exec ${TARGET} "foo()"
  )
)`,
      error: "cannot run inside an atomic batch",
    },
    {
      name: "should refuse --as another account in a real run, naming both",
      script: `switch --as ${OTHER_ACCOUNT} (
  set $x 1
)`,
      error:
        "switch --as 0x7099...79C8: the connected account is 0x1234...5678",
    },
    {
      name: "should refuse a bare --as another account in a real run",
      script: `switch --as ${OTHER_ACCOUNT}`,
      error:
        "switch --as 0x7099...79C8: the connected account is 0x1234...5678",
    },
    {
      name: "should refuse a capture on the block form",
      script: `switch optimism (
  exec ${TARGET} "foo()"
) -?!> $failed`,
      error: '"switch" runs its transactions inside the block',
    },
  ],
});

/** An interpreter that sends: every dispatched action is recorded with the
 *  chain and account the interpreter was on when it was sent. */
function sending(script: string, account: string | undefined) {
  const { evm } = createInterpreter(script, getPublicClient());
  evm.setConnectedAccount(account as `0x${string}` | undefined);
  const sent: { action: Action; chainId: number; me?: string }[] = [];
  const run = () =>
    evm.interpret(script, async (action) => {
      sent.push({
        action,
        chainId: await evm.getChainId(),
        me: await evm.getConnectedAccount().catch(() => undefined),
      });
      return undefined;
    });
  return { evm, sent, run };
}

describe("Std > commands > switch, when the run sends", () => {
  it("sends the entering action before the block and the leaving one after, once each", async () => {
    const { evm, sent, run } = sending(
      `switch optimism (
  set $x 1
)
switch --as ${TEST_ACCOUNT_ADDRESS} (
  switch mainnet (
    set $y 1
  )
)`,
      TEST_ACCOUNT_ADDRESS,
    );
    await run();
    expect(
      sent.map(({ action, chainId }) => [
        isWalletAction(action) && (action.params[0] as any).chainId,
        chainId,
      ]),
    ).toEqual([
      ["0xa", 10],
      ["0x64", 100],
      ["0x1", 1],
      ["0x64", 100],
    ]);
    expect(await evm.getChainId()).toBe(100);
  });

  it("leaves the chain on the host too when a loop break leaves the block", async () => {
    const { evm, sent, run } = sending(
      `loop $i of [1 2] (
  switch optimism (
    loop break
  )
)`,
      TEST_ACCOUNT_ADDRESS,
    );
    await run();
    expect(sent.map(({ chainId }) => chainId)).toEqual([10, 100]);
    expect(await evm.getChainId()).toBe(100);
  });

  it("moves the host back at the end of the block a bare switch was written in", async () => {
    const { evm, sent, run } = sending(
      `if true (
  switch optimism
  set $x 1
)
set $y 1`,
      TEST_ACCOUNT_ADDRESS,
    );
    await run();
    expect(sent.map(({ chainId }) => chainId)).toEqual([10, 100]);
    expect(await evm.getChainId()).toBe(100);
  });

  it("does not move the host back after a failure, but the interpreter is back", async () => {
    const { evm, sent, run } = sending(
      `if true (
  switch optimism
  exec ${TARGET} "foo(uint256)" notanumber
)`,
      TEST_ACCOUNT_ADDRESS,
    );
    await expect(run()).rejects.toThrow();
    expect(sent.map(({ chainId }) => chainId)).toEqual([10]);
    expect(await evm.getChainId()).toBe(100);
  });

  it("puts the chain and the account back when the block fails", async () => {
    const { evm, sent, run } = sending(
      `switch optimism --as ${OTHER_ACCOUNT} (
  exec ${TARGET} "foo(uint256)" notanumber
)`,
      undefined,
    );
    await expect(run()).rejects.toThrow();
    expect(await evm.getChainId()).toBe(100);
    await expect(evm.getConnectedAccount()).rejects.toThrow(
      "No connected account",
    );
    // The run is over: the wallet was moved once and is not asked again.
    expect(sent.map(({ chainId }) => chainId)).toEqual([10]);
  });
});

describe("Std > commands > switch --as, with no account connected", () => {
  it("is @me inside the block and no longer after it", async () => {
    const interpreter = createInterpreter(
      `set $inside 0
switch --as ${OTHER_ACCOUNT} (
  set $inside @me
)`,
      getPublicClient(),
    );
    interpreter.evm.setConnectedAccount(undefined);
    await interpreter.interpret();
    expect(interpreter.getBinding("$inside", BindingsSpace.USER)).toBe(
      OTHER_ACCOUNT,
    );
    await expect(interpreter.evm.getConnectedAccount()).rejects.toThrow(
      "No connected account",
    );
  });

  it("bare, is @me for the rest of the script", async () => {
    const interpreter = createInterpreter(
      `switch --as ${OTHER_ACCOUNT}
set $me @me
set $sender @sender`,
      getPublicClient(),
    );
    interpreter.evm.setConnectedAccount(undefined);
    await interpreter.interpret();
    expect(interpreter.getBinding("$me", BindingsSpace.USER)).toBe(
      OTHER_ACCOUNT,
    );
    expect(interpreter.getBinding("$sender", BindingsSpace.USER)).toBe(
      OTHER_ACCOUNT,
    );
  });

  it("bare inside a block, is @me until the block ends", async () => {
    const interpreter = createInterpreter(
      `set $inside 0
if true (
  switch --as ${OTHER_ACCOUNT}
  set $inside @me
)`,
      getPublicClient(),
    );
    interpreter.evm.setConnectedAccount(undefined);
    await interpreter.interpret();
    expect(interpreter.getBinding("$inside", BindingsSpace.USER)).toBe(
      OTHER_ACCOUNT,
    );
    await expect(interpreter.evm.getConnectedAccount()).rejects.toThrow(
      "No connected account",
    );
  });

  it("bare inside a block that fails, the account is back all the same", async () => {
    const interpreter = createInterpreter(
      `if true (
  switch optimism --as ${OTHER_ACCOUNT}
  exec ${TARGET} "foo(uint256)" notanumber
)`,
      getPublicClient(),
    );
    interpreter.evm.setConnectedAccount(undefined);
    await expect(interpreter.interpret()).rejects.toThrow();
    expect(await interpreter.evm.getChainId()).toBe(100);
    await expect(interpreter.evm.getConnectedAccount()).rejects.toThrow(
      "No connected account",
    );
  });
});
