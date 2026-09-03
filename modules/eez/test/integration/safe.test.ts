import "../setup";
import { beforeAll, describe, it } from "bun:test";
import { executeScript } from "@evmcrispr/core";
import { safeDeployment } from "@evmcrispr/module-safe/addresses";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import { parseAbi } from "viem";
import {
  devnet,
  ensureFunded,
  L1_ID,
  l1,
  l1Wallet,
  testAccount,
} from "../devnet";

/**
 * A Safe on the EEZ devnet as the batching vehicle: browser wallets refuse
 * EIP-5792 batches on chains they do not list, while `safe:execute` is an
 * ordinary transaction to the Safe. The Safe contracts here are the
 * module's zero-salt CREATE2 deployment (`safe/scripts/deploy-create2.ts`).
 */

/** Anvil #1: funded on both chains. */
const FUNDED = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
]);

const run = (script: string) =>
  executeScript(
    script,
    evml.registry,
    {
      chainId: L1_ID,
      transports: getTransports(),
      account: testAccount.address,
    },
    l1Wallet,
    { prepareChains: false },
  );

describe.skipIf(!devnet)("Safe on the EEZ devnet", () => {
  beforeAll(async () => {
    await ensureFunded();
    const { proxyFactory } = safeDeployment(L1_ID);
    const code = await l1.getCode({ address: proxyFactory });
    if (!code || code === "0x") {
      throw new Error(
        "Safe contracts missing on the devnet — run modules/safe/scripts/deploy-create2.ts",
      );
    }
  }, 60_000);

  it("creates a Safe and executes a cross-chain assertion through it", async () => {
    const salt = BigInt(Date.now());
    const result = await run(
      `load eez
load safe

safe:new @me --salt ${salt} -> ProxyCreation(address indexed, address) [$safe _]
safe:execute $safe (
  assert @eez:on!(eezL2 @balance!(ETH ${FUNDED})) > 0 "no balance on L2"
)
print $safe`,
    );
    const logs = result.logs ?? [];
    const safe = logs
      .map((l) => String(l))
      .find((l) => /^0x[0-9a-fA-F]{40}$/.test(l.trim()));
    expect(result.executed).to.have.lengthOf(2);
    for (const e of result.executed) {
      expect((e.result as { status?: string })?.status).to.equal("success");
    }
    expect(safe, "printed safe address").to.exist;
    const owners = await l1.readContract({
      address: safe as `0x${string}`,
      abi: safeAbi,
      functionName: "getOwners",
    });
    expect(owners).to.eql([testAccount.address]);
  }, 240_000);

  it("reverts the Safe transaction when the cross-chain assertion fails", async () => {
    const salt = BigInt(Date.now()) + 1n;
    let failure: unknown;
    try {
      await run(
        `load eez
load safe

safe:new @me --salt ${salt} -> ProxyCreation(address indexed, address) [$safe _]
safe:execute $safe (
  assert @eez:on!(eezL2 @balance!(ETH ${FUNDED})) == 1 "impossible"
)`,
      );
    } catch (err) {
      failure = err;
    }
    expect(failure, "the Safe transaction must fail").to.exist;
  }, 240_000);
});
