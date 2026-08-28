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
  l1Wallet,
  l2,
  l2Wallet,
  testAccount,
} from "../devnet";

const valueAbi = parseAbi(["function value() view returns (uint256)"]);

/**
 * The whole flow against the live devnet: a script on L1 calls a rollup
 * contract through `eez:call`; the executor routes the call through the
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
      `load eez\neez:call ${value} setValue(uint256) ${expected}`,
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
});
