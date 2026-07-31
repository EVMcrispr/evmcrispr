import "../setup";
import { afterAll, describe, it } from "bun:test";
import { expect, getTransports, resetAnvil } from "@evmcrispr/test-utils";
import { evml, Interpreter } from "@evmcrispr/test-utils/evml";
import { mainnet } from "viem/chains";
import { USDC_MAINNET, USDC_WHALE } from "../fixtures";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AMOUNT = 100_000_000n; // 100 USDC

/**
 * The end-to-end cross-chain story: bridge on the source fork, `switch` to
 * the destination chain, and sim auto-relays the destination leg (a mocked
 * Circle attestation driving the real receiveMessage → mint path), so the
 * recipient's balance on the destination fork can simply be asserted.
 *
 * Runs against DRPC upstreams through the in-memory ethereumjs backend, so
 * it needs a VITE_DRPC_API_KEY.
 */
describe("Bridges > cross-chain simulation", () => {
  // The anvil network swap re-forks the shared node; restore the pinned
  // gnosis fork for whatever test file runs next.
  afterAll(async () => {
    await resetAnvil();
  });

  function createRunner() {
    const logs: string[] = [];
    const evm = new Interpreter(evml.registry, {
      account: USDC_WHALE,
      transports: getTransports(),
      onLog: (message: string) => logs.push(message),
    });
    evm.switchChainId(mainnet.id);
    return { evm, logs };
  }

  it("bridges USDC to Base and mints it on the destination fork", async () => {
    const { evm, logs } = createRunner();

    // A fresh address with no USDC on Base, so the minted amount is exact.
    const recipient = "0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9";

    await evm.interpret(`load sim
load bridges
sim:fork --using anvil --from ${USDC_WHALE} (
  bridges:bridge ${AMOUNT} ${USDC_MAINNET} to base --using CCTPv2 --receiver ${recipient}
  switch base
  set $balance @get(${USDC_BASE} "balanceOf(address)(uint256)" ${recipient})
  sim:expect @bool($balance == ${AMOUNT})
)`);

    expect(
      logs.some((l) => l.includes("Queued cctp-v2 transfer Ethereum → Base")),
      "the burn was detected on the source fork",
    ).to.be.true;
    expect(
      logs.some((l) => l.includes("Delivering cctp-v2 transfer from Ethereum")),
      "the destination leg was delivered on switch",
    ).to.be.true;
  }, 180_000);

  it("fails fast with a balance error when the sim sender lacks the token", async () => {
    // Fresh EOA with no USDC on mainnet.
    const broke = "0x59c2de8db2d1516bd9354ca31a58fea25eb37ba9";
    const logs: string[] = [];
    const evm = new Interpreter(evml.registry, {
      account: broke,
      transports: getTransports(),
      onLog: (message: string) => logs.push(message),
    });
    evm.switchChainId(mainnet.id);

    let error: Error | undefined;
    try {
      await evm.interpret(`load sim
load bridges
sim:fork --using ethereumjs --from ${broke} (
  bridges:bridge ${AMOUNT} ${USDC_MAINNET} to base --using CCTPv2
)`);
    } catch (e) {
      error = e as Error;
    }
    expect(error, "the bridge should fail the simulation").to.not.be.undefined;
    expect(error!.message).to.include("holds 0 USDC on Ethereum");
    expect(error!.message).to.not.include("Transaction reverted");
  }, 180_000);

  it("warns when the script never switches to the destination chain", async () => {
    const { evm, logs } = createRunner();

    await evm.interpret(`load sim
load bridges
sim:fork --using anvil --from ${USDC_WHALE} (
  bridges:bridge ${AMOUNT} ${USDC_MAINNET} to base --using CCTPv2
)`);

    expect(
      logs.some((l) => l.includes("never delivered") && l.includes("8453")),
    ).to.be.true;
  }, 180_000);
});
