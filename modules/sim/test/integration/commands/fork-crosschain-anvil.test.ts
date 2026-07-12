import "../../setup";
import { afterAll, describe, it } from "bun:test";
import { expect, getTransports, resetAnvil } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { gnosis } from "viem/chains";
import TestBridge, {
  EMITTER,
  EMITTER_BYTECODE,
} from "../../fixtures/test-bridge";

evml.use(TestBridge);

const SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ADDR = "0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9";

function createRunner() {
  const logs: string[] = [];
  const evm = new Interpreter(evml.registry, {
    account: SENDER,
    transports: getTransports(),
    onLog: (message: string) => logs.push(message),
  });
  evm.switchChainId(gnosis.id);
  return { evm, logs };
}

describe("Sim > commands > fork > cross-chain (anvil network swap)", () => {
  // The network swap re-forks the shared anvil node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  it("preserves each chain's state across back-and-forth switches (dumpState/loadState)", async () => {
    const { evm } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork --using anvil (
  sim:set-balance ${ADDR} 111
  testbridge:assert-balance ${ADDR} 111
  switch 1
  testbridge:assert-balance ${ADDR} 0
  sim:set-balance ${ADDR} 222
  switch 100
  testbridge:assert-balance ${ADDR} 111
  switch 1
  testbridge:assert-balance ${ADDR} 222
)`);
  });

  it("auto-relays bridge transfers across the network swap", async () => {
    const { evm, logs } = createRunner();
    await evm.interpret(`load sim
load testbridge
sim:fork --using anvil (
  sim:set-code ${EMITTER} ${EMITTER_BYTECODE}
  testbridge:send 1 ${ADDR} 4242
  switch 1
  testbridge:assert-balance ${ADDR} 4242
)`);

    expect(logs.some((l) => l.includes("Queued test-bridge transfer 100 → 1")))
      .to.be.true;
  });
});
