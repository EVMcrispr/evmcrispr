import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { isWalletAction } from "@evmcrispr/sdk";
import { expect, getTransports, resetAnvil } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { gnosis } from "viem/chains";
import TestBridge, {
  EMITTER,
  EMITTER_BYTECODE,
} from "../../fixtures/test-bridge";

evml.use(TestBridge);

// Anvil's default funded account.
const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
// Improbable addresses with no balance on either fork.
const ADDR_A = "0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9";
const ADDR_B = "0x1d96f2f6bef1202e4ce1ff6dad0c2cb002861d3e";

function createRunner() {
  const logs: string[] = [];
  const evm = new Interpreter(evml.registry, {
    account: SENDER,
    transports: getTransports(),
    onLog: (message: string) => logs.push(message),
  });
  evm.switchChainId(gnosis.id);
  // Every change of chain the fork was asked for, in order.
  const moves: string[] = [];
  evm.registerActionObserver((action) => {
    if (isWalletAction(action))
      moves.push((action.params[0] as { chainId: string }).chainId);
  });
  return { evm, logs, moves };
}

describe("Sim > commands > fork > cross-chain (ethereumjs)", () => {
  // The in-process forks read gnosis state through the shared anvil; make
  // sure it is healthy after whatever network swaps ran before this file.
  beforeAll(async () => {
    await resetAnvil();
  });

  it("keeps per-chain forks isolated and preserves state when switching back", async () => {
    const { evm } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork (
  sim:set-balance ${ADDR_A} 111
  testbridge:assert-balance ${ADDR_A} 111
  switch 1
  testbridge:assert-balance ${ADDR_A} 0
  sim:set-balance ${ADDR_A} 222
  switch 100
  testbridge:assert-balance ${ADDR_A} 111
  switch 1
  testbridge:assert-balance ${ADDR_A} 222
)`);
  });

  it("auto-relays a bridge transfer when switching to the destination chain", async () => {
    const { evm, logs } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork (
  sim:set-code ${EMITTER} ${EMITTER_BYTECODE}
  testbridge:send 1 ${ADDR_A} 5000000
  switch 1
  testbridge:assert-balance ${ADDR_A} 5000000
)`);

    expect(
      logs.some((l) =>
        l.includes("Queued test-bridge transfer Gnosis → Ethereum"),
      ),
    ).to.be.true;
    expect(
      logs.some((l) =>
        l.includes("Delivering test-bridge transfer from Gnosis"),
      ),
    ).to.be.true;
  });

  it("relays transfers initiated on a secondary chain back to the original one", async () => {
    const { evm } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork (
  sim:set-code ${EMITTER} ${EMITTER_BYTECODE}
  testbridge:send 1 ${ADDR_A} 5000000
  switch 1 (
    testbridge:assert-balance ${ADDR_A} 5000000
    sim:set-code ${EMITTER} ${EMITTER_BYTECODE}
    testbridge:send 100 ${ADDR_B} 777
  )
  testbridge:assert-balance ${ADDR_B} 777
)`);
  });

  it("a bare switch inside an if in a fork ends with the if, and the fork is back on its chain", async () => {
    const { evm } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork (
  sim:set-balance ${ADDR_A} 111
  if true (
    switch 1
    testbridge:assert-balance ${ADDR_A} 0
  )
  testbridge:assert-balance ${ADDR_A} 111
)`);
  });

  it("returns to its starting chain when its block ends on another one, and leaves the script where it was", async () => {
    const { evm, moves } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork --as ${ADDR_B} (
  sim:set-balance ${ADDR_A} 111
  switch 1
  testbridge:assert-balance ${ADDR_A} 0
)`);
    expect(moves).to.eql(["0x1", "0x64"]);
    expect(await evm.getChainId()).to.eq(gnosis.id);
    expect(await evm.getConnectedAccount()).to.eq(SENDER);
  });

  it("delivers a transfer bridged back to the starting chain when the block ends, and still warns for a chain it never returns to", async () => {
    const { evm, logs } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork (
  switch 1
  sim:set-code ${EMITTER} ${EMITTER_BYTECODE}
  testbridge:send 100 ${ADDR_B} 777
  testbridge:send 10 ${ADDR_A} 5
)`);
    expect(
      logs.some((l) =>
        l.includes("Delivering test-bridge transfer from Ethereum"),
      ),
    ).to.be.true;
    const warning = logs.find((l) => l.includes("never delivered"));
    expect(warning).to.include("1 bridge transfer(s)");
    expect(warning).to.include("OP Mainnet");
  });

  it("asks for no change of chain when its block stays on one", async () => {
    const { evm, logs, moves } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork (
  sim:set-balance ${ADDR_A} 111
  testbridge:assert-balance ${ADDR_A} 111
)`);
    expect(moves).to.eql([]);
    expect(logs.some((l) => l.includes("Delivering"))).to.be.false;
  });

  it("when its block throws on another chain, restores the script and asks for nothing more", async () => {
    const { evm, moves } = createRunner();
    let error: Error | undefined;
    try {
      await evm.interpret(`load sim
sim:fork --as ${ADDR_B} (
  switch 1
  sim:expect false
)`);
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include("An assertion failed");
    expect(moves).to.eql(["0x1"]);
    expect(await evm.getChainId()).to.eq(gnosis.id);
    expect(await evm.getConnectedAccount()).to.eq(SENDER);
  });

  it("warns about transfers whose destination chain was never activated", async () => {
    const { evm, logs } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork (
  sim:set-code ${EMITTER} ${EMITTER_BYTECODE}
  testbridge:send 1 ${ADDR_A} 42
)`);

    expect(
      logs.some((l) => l.includes("never delivered") && l.includes("Ethereum")),
    ).to.be.true;
  });
});
