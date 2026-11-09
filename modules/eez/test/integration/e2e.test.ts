import { chainGateway } from "@evmcrispr/sdk";
import "../setup";
import { beforeAll, describe, it } from "bun:test";
import { executeScript, isTransactionAction } from "@evmcrispr/core";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { parseAbi } from "viem";
import { makeDefaultHandlers } from "../../../../packages/core/src/evml/execute";
import { eezBaseAbi } from "../../src/abis";
import { EEZ_CHAINS } from "../../src/constants";
import {
  deployValue,
  devnet,
  ensureFunded,
  L1_ID,
  L2_ID,
  L2_ROLLUP_ID,
  l1,
  l1Wallet,
  l2,
  l2Wallet,
  testAccount,
} from "../devnet";

const valueAbi = parseAbi(["function value() view returns (uint256)"]);

/**
 * The whole flow against the live devnet: a script on L1 calls a rollup
 * contract through `eez:on`; the executor routes the call through the
 * L1 ingress with the local key; the rollup state changes.
 */
describe.skipIf(!devnet)("Eez > end to end (hosted devnet)", () => {
  beforeAll(async () => {
    await ensureFunded();
  }, 120_000);

  it("sets a value on the rollup from L1 in one atomic transaction", async () => {
    const value = await deployValue(l2Wallet, l2);
    const expected = BigInt(Date.now());

    const result = await executeScript(
      `load eez\neez:on eezL2 (\n  exec ${value} setValue(uint256) ${expected}\n)`,
      evml.registry,
      {
        chainId: L1_ID,
        transports: getTransports(),
        account: testAccount.address,
      },
      l1Wallet,
      { prepareChains: false },
    );

    // Proxy creation (plain L1 tx) and the routed cross-chain call.
    expect(result.executed).to.have.lengthOf(2);
    for (const { result: receipt } of result.executed) {
      expect((receipt as any).status).to.equal("success");
    }
    expect(result.logs.join("\n")).to.include("Calling");

    // The L1 receipt already implies the atomic effect; read it back
    // anyway, tolerating the rollup RPC's occasional empty replies.
    let observed: bigint | undefined;
    for (let i = 0; i < 15 && observed !== expected; i++) {
      try {
        observed = await l2.readContract({
          address: value,
          abi: valueAbi,
          functionName: "value",
        });
      } catch {
        // retry
      }
      if (observed !== expected) await Bun.sleep(2_000);
    }
    expect(observed).to.equal(expected);
  }, 180_000);

  it("prices a hand-written call to a proxy that nothing marked as crossing chains", async () => {
    // No eez:on: the script calls the L1 proxy of a rollup contract itself.
    // The executor simulates it on Chiado's own RPC, sees the registry's
    // gate error, and only then asks the composer for the settlement price.
    const value = await deployValue(l2Wallet, l2);
    const registry = EEZ_CHAINS[L1_ID].registry;
    const proxy = await l1.readContract({
      address: registry,
      abi: eezBaseAbi,
      functionName: "computeCrossChainProxyAddress",
      args: [value, L2_ROLLUP_ID],
    });
    const created = await l1Wallet.writeContract({
      address: registry,
      abi: eezBaseAbi,
      functionName: "createCrossChainProxy",
      args: [value, L2_ROLLUP_ID],
    });
    await l1.waitForTransactionReceipt({ hash: created, timeout: 60_000 });
    const expected = BigInt(Date.now());

    // Chiado's own RPC cannot estimate a call to a proxy (it reverts with
    // the registry's gate error), so the script sizes it.
    const result = await executeScript(
      `load eez\nexec ${proxy} setValue(uint256) ${expected} --gas 350000`,
      evml.registry,
      {
        chainId: L1_ID,
        transports: getTransports(),
        account: testAccount.address,
      },
      l1Wallet,
      { prepareChains: false },
    );

    expect(result.executed).to.have.lengthOf(1);
    expect((result.executed[0].action as any).crossChain).to.equal(undefined);
    expect((result.executed[0].result as any).status).to.equal("success");
    let observed: bigint | undefined;
    for (let i = 0; i < 15 && observed !== expected; i++) {
      observed = await l2
        .readContract({ address: value, abi: valueAbi, functionName: "value" })
        .catch(() => undefined);
      if (observed !== expected) await Bun.sleep(2_000);
    }
    expect(observed).to.equal(expected);
  }, 240_000);

  it("comes back to L1 through the rollup with a nested block", async () => {
    // L1 → L2 → L1: the value contract lives on L1; the script reaches it
    // from L1 by way of the rollup, so the effect is applied in the same
    // L1 transaction that went out.
    const value = await deployValue(l1Wallet, l1);
    const expected = BigInt(Date.now());
    const defaults = makeDefaultHandlers({
      account: testAccount.address,
      maximizeGasLimit: false,
      // The script loads eez, which declares the ChiadoX gateways.
      gatewayFor: chainGateway,
    });

    const result = await executeScript(
      [
        "load eez",
        "eez:on eezL2 (",
        "  eez:on gnosisChiado (",
        `    exec ${value} setValue(uint256) ${expected}`,
        "  )",
        ")",
      ].join("\n"),
      evml.registry,
      {
        chainId: L1_ID,
        transports: getTransports(),
        account: testAccount.address,
      },
      l1Wallet,
      {
        prepareChains: false,
        // The target's proxy on L2 is created on L2 (the composer cannot
        // create one through a cross-chain call): the wallet switches
        // there and back, so each chain gets its own local wallet.
        handlers: {
          wallet: async (action, ctx) =>
            action.method === "wallet_switchEthereumChain"
              ? undefined
              : ctx.next(action),
          transaction: (action, ctx) =>
            defaults.transaction(action, {
              ...ctx,
              walletClient: action.chainId === L2_ID ? l2Wallet : l1Wallet,
            }),
        },
      },
    );

    // The target's proxy created on L2, the L1 proxy of that hop, and the
    // nested call.
    const sent = result.executed.filter(
      (e) => isTransactionAction(e.action) && !e.action.readOnly,
    );
    expect(sent).to.have.lengthOf(3);
    for (const { result: receipt } of sent) {
      expect((receipt as any).status).to.equal("success");
    }
    expect(
      await l1.readContract({
        address: value,
        abi: valueAbi,
        functionName: "value",
      }),
    ).to.equal(expected);
  }, 240_000);
});
