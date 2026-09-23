import "../setup";
import { beforeAll, describe, it } from "bun:test";
import { executeScript, isTransactionAction } from "@evmcrispr/core";
import { safeDeployment } from "@evmcrispr/module-safe/addresses";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import type { WalletClient } from "viem";
import {
  type ActionHandlerCtx,
  makeDefaultHandlers,
} from "../../../../packages/core/src/evml/execute";
import {
  devnet,
  ensureFunded,
  L1_ID,
  L2_ID,
  l1,
  l1Wallet,
  l2Wallet,
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

  // Cross-chain transactions sent from Chiado are not composed by the EEZ
  // front there (a public chain it does not build blocks for), so the Safe
  // lives on the rollup: it asserts Chiado state and mints on Chiado.
  it("earns the whale badge: rollup Safe asserts Chiado state and mints there in one Safe transaction", async () => {
    const salt = BigInt(Date.now());
    const wallets: Record<number, WalletClient> = {
      [L1_ID]: l1Wallet,
      [L2_ID]: l2Wallet,
    };
    const defaults = makeDefaultHandlers({
      account: testAccount.address,
      maximizeGasLimit: false,
    });
    const routed = (ctx: ActionHandlerCtx, chainId?: number) => ({
      ...ctx,
      walletClient: wallets[chainId ?? L1_ID] ?? ctx.walletClient,
    });
    const result = await executeScript(
      `load eez
load contracts
load safe

switch eezL2
set $minterSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
interface IBadge { function mint(address to) external; }
contract Minter {
  function mintBadge(IBadge badge) external { badge.mint(msg.sender); }
}
SOL
contracts:deploy $minter @contracts:solidity($minterSrc)

switch gnosisChiado
set $badgeSrc <<<SOL
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Badge {
  address public immutable minter;
  mapping(address => uint256) public balanceOf;
  constructor(address m) { minter = m; }
  function mint(address to) external { require(msg.sender == minter, "only minter"); balanceOf[to] += 1; }
}
SOL
contracts:deploy $badge @contracts:solidity($badgeSrc) --constructor "constructor(address)" --constructor-args [@eez:proxy(eezL2 $minter)]
eez:deploy-proxy $minter

switch eezL2
eez:deploy-proxy $badge
safe:new @me --salt ${salt} -> ProxyCreation(address indexed, address) [$safe _]
eez:faucet $safe --amount 100e18
set $minterOnChiado @eez:on(gnosisChiado @eez:proxy(eezL2 $minter))
safe:execute $safe --gas 1500000 (
  assert @balance!(ETH $safe) >= 100e18 "not a whale on L2"
  assert @eez:on!(gnosisChiado $badge::!{minter()(address)}) == $minterOnChiado "the badge does not trust this minter"
  exec $minter mintBadge(address) @eez:proxy(gnosisChiado $badge)
)
print "badges:" @eez:on(gnosisChiado $badge::{balanceOf(address)(uint256) $safe})`,
      evml.registry,
      {
        chainId: L1_ID,
        transports: getTransports(),
        account: testAccount.address,
      },
      l1Wallet,
      {
        prepareChains: false,
        handlers: {
          wallet: async (action, ctx) =>
            action.method === "wallet_switchEthereumChain"
              ? undefined
              : ctx.next(action),
          transaction: (action, ctx) =>
            defaults.transaction(action, routed(ctx, action.chainId)),
        },
      },
    );
    const sent = result.executed.filter(
      (e) => isTransactionAction(e.action) && !e.action.readOnly,
    );
    // minter | badge, minter-proxy | badge-proxy, safe:new | faucet | execTransaction
    expect(sent.length).to.be.gte(6);
    for (const { result: receipt } of sent) {
      expect((receipt as { status?: string })?.status).to.equal("success");
    }
    expect(result.logs.join("\n")).to.match(/badges:\s*1\b/);
  }, 600_000);

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
