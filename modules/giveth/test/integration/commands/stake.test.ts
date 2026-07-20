import "../../setup";
import { afterAll } from "bun:test";
import {
  expect,
  resetAnvil,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  decodeFunctionData,
  encodeAbiParameters,
  keccak256,
  numberToHex,
  parseAbi,
} from "viem";
import {
  GARDEN,
  GIV,
  GIV_OPTIMISM,
  GIVPOWER_LM_OPTIMISM,
} from "../../fixtures";

const stakingAbi = parseAbi([
  "function wrap(uint256 amount)",
  "function stake(uint256 amount)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const AMOUNT = 100n * 10n ** 18n;

// The sim:fork lifecycle case leaves its state on the shared anvil node;
// restore the pinned-block fork for later test files.
afterAll(async () => {
  await resetAnvil();
});

// GIV on Gnosis keeps its balances mapping at slot 3 (probed on-chain by
// matching keccak(holder, slot) storage against balanceOf, 2026-07-20).
const givBalanceSlot = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [TEST_ACCOUNT_ADDRESS, 3n],
  ),
);
const THOUSAND_GIV = numberToHex(1000n * 10n ** 18n, { size: 32 });

describeCommand("stake", {
  describeName: "Giveth > commands > stake <amount>",
  module: "giveth",
  preamble: "load giveth",
  cases: [
    {
      name: "wraps GIV into the GIVgarden on Gnosis with auto-approve",
      script: "giveth:stake 100e18",
      validate: (actions) => {
        expect(actions).to.have.length(2);
        const [approve, wrap] = actions as any[];

        expect(approve.to).to.eq(GIV);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([GARDEN, AMOUNT]);

        expect(wrap.to).to.eq(GARDEN);
        const { functionName, args } = decodeFunctionData({
          abi: stakingAbi,
          data: wrap.data,
        });
        expect(functionName).to.eq("wrap");
        expect(args).to.eql([AMOUNT]);
      },
    },
    {
      name: "skips the approve action with --no-approve true",
      script: "giveth:stake 100e18 --no-approve true",
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect((actions[0] as any).to).to.eq(GARDEN);
      },
    },
    {
      name: "does nothing on a zero amount",
      script: "giveth:stake 0",
      validate: (actions) => {
        expect(actions).to.have.length(0);
      },
    },
    {
      name: "resolves `max` against pending actions earlier in the script",
      // The test account holds no GIV, but the unstake credits 100 GIV to
      // its virtual wallet balance — `max` must pick that up.
      script: "giveth:unstake 100e18\ngiveth:stake max",
      validate: (actions) => {
        expect(actions).to.have.length(3);
        const [, approve, wrap] = actions as any[];
        expect(approve.to).to.eq(GIV);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([GARDEN, AMOUNT]);
        expect(wrap.to).to.eq(GARDEN);
        const { functionName, args } = decodeFunctionData({
          abi: stakingAbi,
          data: wrap.data,
        });
        expect(functionName).to.eq("wrap");
        expect(args).to.eql([AMOUNT]);
      },
    },
    {
      name: "counts pending actions of the same batch for `max`",
      script: `batch (
  giveth:stake 500e18 --no-approve true
  giveth:lock max 26
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        const batched = actions[0] as any;
        expect(batched.type).to.eq("batched");
        expect(batched.actions).to.have.length(2);
        const lock = decodeFunctionData({
          abi: parseAbi(["function lock(uint256 amount, uint256 rounds)"]),
          data: batched.actions[1].data,
        });
        expect(lock.args).to.eql([500n * 10n ** 18n, 26n]);
      },
    },
    {
      name: "keeps batch deltas scoped to their batch",
      // In a live run the batch executes at its boundary, so commands after
      // it must not double-count its deltas on top of fresh chain reads.
      // The cost is that a plain (non-executing) interpretation like this
      // one under-counts across the boundary — max resolves to zero here.
      script: `batch (
  giveth:stake 500e18 --no-approve true
)
giveth:lock max 26`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
        expect((actions[0] as any).type).to.eq("batched");
      },
    },
    {
      name: "maxes out GIVpower with claim/stake max/lock max inside sim:fork",
      timeout: 30000,
      // The executing path: each command runs on the fork before the next,
      // so `max` resolves from real chain state instead of the ledger.
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 10e18
  sim:set-storage-at ${GIV} ${givBalanceSlot} ${THOUSAND_GIV}
  giveth:claim
  giveth:stake max
  giveth:lock max 26
  sim:expect @bool(@giveth:staked() == 1000e18)
  sim:expect @bool(@giveth:stakable() == 0)
  sim:expect @bool(@giveth:lockable() == 0)
  sim:expect @bool(@giveth:givpower(@me) > 1000e18)
)`,
      validate: () => {
        // Reaching this point means the guardless max-out script staked and
        // locked the full balance on the fork without reverting.
      },
    },
    {
      name: "runs a full stake/lock/unlock/unstake lifecycle inside sim:fork",
      timeout: 30000,
      script: `load sim
sim:fork --using anvil (
  sim:set-balance @me 10e18
  sim:set-storage-at ${GIV} ${givBalanceSlot} ${THOUSAND_GIV}
  set $lockRound @num(@giveth:round + 1)
  giveth:stake 1000e18
  sim:expect @bool(@giveth:givpower(@me) == 1000e18)
  giveth:lock 400e18 1
  sim:expect @bool(@giveth:givpower(@me) > 1000e18)
  giveth:unstake 600e18
  wait 2419200
  giveth:unlock $lockRound
  giveth:unstake max
  sim:expect @bool(@token.balance(${GIV} @me) >= 1000e18)
)`,
      validate: () => {
        // Reaching this point means approve, wrap, lock, unlock, unwrap and
        // unwrap-max all executed on the fork without reverting, the lock
        // boosted GIVpower above the staked amount, and every GIV came back
        // (>= because withdrawing to zero auto-harvests accrued rewards).
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on chains without a GIVpower deployment",
      script: "switch mainnet\ngiveth:stake 100e18",
      error: "GIVpower is not deployed on chain 1",
    },
    {
      name: "should fail on a negative amount",
      script: "giveth:stake -1",
      error: "must not be negative",
    },
  ],
  docCases: [
    {
      description: "Stake 100 GIV for GIVpower (auto-approves)",
      code: "giveth:stake 100e18",
    },
    {
      description: "Stake every GIV in the wallet",
      code: "giveth:stake max",
    },
  ],
});

describeCommand("stake", {
  describeName: "Giveth > commands > stake > unipool flavor (Optimism)",
  module: "giveth",
  preamble: "load giveth\nswitch optimism",
  cases: [
    {
      name: "stakes GIV directly on the UnipoolGIVpower contract",
      script: "giveth:stake 100e18",
      validate: (actions) => {
        const txs = (actions as any[]).filter((a) => a.data);
        expect(txs).to.have.length(2);
        const [approve, stake] = txs;

        expect(approve.to).to.eq(GIV_OPTIMISM);
        const approval = decodeFunctionData({
          abi: erc20Abi,
          data: approve.data,
        });
        expect(approval.args).to.eql([GIVPOWER_LM_OPTIMISM, AMOUNT]);

        expect(stake.to).to.eq(GIVPOWER_LM_OPTIMISM);
        const { functionName, args } = decodeFunctionData({
          abi: stakingAbi,
          data: stake.data,
        });
        expect(functionName).to.eq("stake");
        expect(args).to.eql([AMOUNT]);
      },
    },
  ],
});
