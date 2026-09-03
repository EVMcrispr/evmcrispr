import "../setup";
import { beforeAll, describe, it } from "bun:test";
import { executeScript } from "@evmcrispr/core";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { parseAbi } from "viem";
import {
  deployValue,
  devnet,
  ensureFunded,
  L1_ID,
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

  it("comes back to L1 through the rollup with a nested block", async () => {
    // L1 → L2 → L1: the value contract lives on L1; the script reaches it
    // from L1 by way of the rollup, so the effect is applied in the same
    // L1 transaction that went out.
    const value = await deployValue(l1Wallet, l1);
    const expected = BigInt(Date.now());

    const result = await executeScript(
      [
        "load eez",
        "eez:on eezL2 (",
        "  eez:on eezL1 (",
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
      { prepareChains: false },
    );

    // The L1 proxy of the hop (plain), the hop's creation on L2 through
    // the L2 registry's proxy (cross-chain), and the nested call; plus,
    // the first time on a devnet, that registry proxy itself.
    expect(result.executed.length).to.be.within(3, 4);
    for (const { result: receipt } of result.executed) {
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
