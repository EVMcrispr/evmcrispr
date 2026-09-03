import "../setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { executeScript } from "@evmcrispr/core";
import { getTransports } from "@evmcrispr/test-utils";
import { evml } from "@evmcrispr/test-utils/evml";
import type { Account, Address, Hex, WalletClient } from "viem";
import {
  createWalletClient,
  erc20Abi,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type ActionHandlerCtx,
  makeDefaultHandlers,
} from "../../../../packages/core/src/evml/execute";
import {
  devnet,
  ensureFunded,
  L1_ID,
  L1_RPC,
  L2_ID,
  L2_RPC,
  l1,
  l1Chain,
  l2,
  l2Chain,
  testAccount,
} from "../devnet";

/**
 * An atomic cross-chain swap with no counterparty risk and no bridge:
 * Alice gives 1 DAI on L1, Bob gives 1 USDC on L2, in Bob's single L1
 * transaction — both legs or neither.
 *
 * The vehicle is a generic intents contract on L2: OpenZeppelin's
 * TimelockController with no delay, plus a transient `executor` so a batch
 * can assert who is executing it. Alice (the proposer) schedules the swap
 * as an EVML block; anyone may execute it, and the block's own assertion
 * admits only Bob's L2 proxy — which is what the timelock sees as
 * msg.sender when Bob calls the contract's L1 proxy from L1. The DAI leg
 * nests back to L1 through the contract's own proxy.
 */

const alice = testAccount;
const bob = privateKeyToAccount(
  keccak256(stringToHex("evmcrispr-eez-devnet-test-account-bob")),
);

const DAI_AMOUNT = 10n ** 18n;
const USDC_AMOUNT = 10n ** 6n;

const INTENTS_SRC = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import "@openzeppelin/contracts@5.4.0/governance/TimelockController.sol";

function one(address a) pure returns (address[] memory arr) { arr = new address[](1); arr[0] = a; }

/// A TimelockController with no delay: the proposer schedules batches,
/// anyone may execute them, and a batch can assert who is executing it.
contract Intents is TimelockController {
  /// Who is executing the current batch; lives only for this transaction.
  address public transient executor;

  constructor(address proposer)
    TimelockController(0, one(proposer), one(address(0)), address(0)) {}

  function executeBatch(
    address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads,
    bytes32 predecessor, bytes32 salt
  ) public payable override {
    executor = msg.sender;
    super.executeBatch(targets, values, payloads, predecessor, salt);
    executor = address(0);
  }
}`;

const MOCK_SRC = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import "@openzeppelin/contracts@5.4.0/token/ERC20/ERC20.sol";
contract Mock is ERC20 {
  constructor() ERC20("Mock", "MOCK") {}
  function mint(address to, uint256 amount) external { _mint(to, amount); }
}`;

interface World {
  dai: Address;
  usdc: Address;
  intents?: Address;
}

/** The swap itself. Scheduled by Alice and executed by Bob as the same
 *  calls, so it names both parties instead of `@me`. */
const swapBlock = ({ dai, usdc, intents }: World) => `(
  assert ${intents}::{executor()(address)} == @eez:proxy(eezL1 ${bob.address}) "only Bob"
  token:transfer-from ${USDC_AMOUNT} ${usdc} from ${bob.address} to ${alice.address}
  eez:on eezL1 (
    token:transfer-from ${DAI_AMOUNT} ${dai} from ${alice.address} to ${bob.address}
  )
)`;

/** Two mock tokens; Bob holds the USDC, Alice holds nothing yet. */
const WORLD = `load contracts

set $mockSrc <<<SOL
${MOCK_SRC}
SOL

switch eezL1
contracts:deploy $dai @contracts:solidity($mockSrc contract:Mock)

switch eezL2
contracts:deploy $usdc @contracts:solidity($mockSrc contract:Mock)
exec $usdc mint(address,uint256) ${bob.address} ${USDC_AMOUNT}

print "dai:" $dai
print "usdc:" $usdc`;

/** Alice: deploy the intents contract on L2, schedule the swap, approve on L1. */
const ALICE = (w: World) => `load eez
load contracts
load governor
load token

switch eezL2
set $intentsSrc <<<SOL
${INTENTS_SRC}
SOL
contracts:deploy $intents @contracts:solidity($intentsSrc contract:Intents) --constructor "constructor(address)" --constructor-args [${alice.address}]
eez:deploy-proxy ${w.dai}          # DAI's proxy here: the batch's way back to L1
eez:deploy-proxy ${bob.address}    # Bob's proxy here: the executor the batch expects

governor:timelock-schedule $op $intents 0 ${swapBlock({ ...w, intents: "$intents" as Address })}

switch eezL1
eez:deploy-proxy $intents          # msg.sender of the DAI leg, and Bob's door in
token:approve ${DAI_AMOUNT} ${w.dai} for @eez:proxy(eezL2 $intents)
print "intents:" $intents`;

/** Bob: approve on L2, execute from L1 through his proxy. */
const TAKE = (w: World) => `load eez
load governor
load token

switch eezL2
token:approve ${USDC_AMOUNT} ${w.usdc} for ${w.intents}

switch eezL1
eez:on eezL2 (
  governor:timelock-execute ${w.intents} ${swapBlock(w)}
)`;

/** Alice funds herself: the swap becomes takeable. */
const FUND_ALICE = (w: World) => `switch eezL1
exec ${w.dai} mint(address,uint256) ${alice.address} ${DAI_AMOUNT}`;

async function runAs(account: Account, script: string): Promise<string> {
  const wallets: Record<number, WalletClient> = {
    [L1_ID]: createWalletClient({
      account,
      chain: l1Chain,
      transport: http(L1_RPC),
    }),
    [L2_ID]: createWalletClient({
      account,
      chain: l2Chain,
      transport: http(L2_RPC),
    }),
  };
  const defaults = makeDefaultHandlers({
    account: account.address,
    maximizeGasLimit: false,
  });
  const routed = (ctx: ActionHandlerCtx, chainId?: number) => ({
    ...ctx,
    walletClient: wallets[chainId ?? L1_ID] ?? ctx.walletClient,
  });
  const result = await executeScript(
    script,
    evml.registry,
    {
      chainId: L1_ID,
      transports: getTransports(),
      account: account.address,
    },
    wallets[L1_ID],
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
  for (const e of result.executed) {
    const status = (e.result as { status?: string })?.status;
    if (status && status !== "success") throw new Error(`reverted: ${status}`);
  }
  return result.logs.join("\n");
}

/** The message a failing script rejects with. */
const failure = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("expected the script to fail");
};

const printed = (log: string, label: string): Address => {
  const m = new RegExp(`${label}:\\s*(0x[0-9a-fA-F]{40})`).exec(log);
  if (!m) throw new Error(`no "${label}:" in\n${log}`);
  return m[1] as Address;
};

const balances = async (w: World) => ({
  bobDai: await l1.readContract({
    address: w.dai,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [bob.address],
  }),
  aliceUsdc: await l2.readContract({
    address: w.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [alice.address],
  }),
});

describe.skipIf(!devnet)(
  "Eez > atomic swap through an intents contract",
  () => {
    const world: World = { dai: "0x", usdc: "0x" };

    beforeAll(async () => {
      await ensureFunded(alice.address);
      await ensureFunded(bob.address);
      const log = await runAs(alice, WORLD);
      world.dai = printed(log, "dai");
      world.usdc = printed(log, "usdc");
    }, 300_000);

    it("Alice schedules the swap without holding the DAI", async () => {
      const log = await runAs(alice, ALICE(world));
      world.intents = printed(log, "intents");
    }, 300_000);

    const scheduled = (): World => {
      if (!world.intents) throw new Error("the swap was never scheduled");
      return world;
    };

    it("Bob cannot take it while Alice has no DAI", async () => {
      // The DAI leg reverts one hop further in, inside the composed block,
      // where no simulation reaches: the composer evicts the transaction
      // instead of mining it, and the script learns of it from the receipt.
      const reason = await failure(runAs(bob, TAKE(scheduled())));
      const hash = /0x[0-9a-f]{64}/i.exec(reason)?.[0] as Hex | undefined;
      expect(reason).toMatch(/Timed out while waiting for transaction/);
      expect(hash).toBeDefined();
      expect(await l1.getTransaction({ hash: hash! }).catch(() => null)).toBe(
        null,
      );
      expect(await balances(world)).toEqual({ bobDai: 0n, aliceUsdc: 0n });
    }, 300_000);

    it("nobody but Bob can take it, once Alice holds the DAI", async () => {
      await runAs(alice, FUND_ALICE(world));
      // The batch's own assertion sees Alice's proxy as executor: eez:on
      // simulates the leg as the rollup will and refuses before sending.
      const reason = await failure(runAs(alice, TAKE(scheduled())));
      expect(reason).toMatch(
        /would revert on EEZ L2: assertion failed: only Bob/,
      );
      expect(await balances(world)).toEqual({ bobDai: 0n, aliceUsdc: 0n });
    }, 300_000);

    it("Bob takes it in one L1 transaction: DAI on L1, USDC on L2", async () => {
      await runAs(bob, TAKE(scheduled()));
      expect(await balances(world)).toEqual({
        bobDai: DAI_AMOUNT,
        aliceUsdc: USDC_AMOUNT,
      });
    }, 300_000);
  },
);
