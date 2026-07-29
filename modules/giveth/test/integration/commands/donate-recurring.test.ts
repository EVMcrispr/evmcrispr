import "../../setup";
import { beforeAll, beforeEach, describe, it } from "bun:test";
import {
  type Action,
  isWalletAction,
  type TransactionAction,
} from "@evmcrispr/sdk";
import {
  expect,
  getPublicClient,
  getTransports,
  getWalletClients,
  resetAnvil,
} from "@evmcrispr/test-utils";
import { describeCommand, evml, Interpreter } from "@evmcrispr/test-utils/evml";
import type { WalletClient } from "viem";
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";
import { gnosis } from "viem/chains";
import { CFA_FORWARDER } from "../../../src/utils/superfluid";
import {
  PROJECT_ANCHOR_GNOSIS,
  TIP_ANCHOR_GNOSIS,
  USDC,
  USDCX,
  XDAIX,
  ZERO_ADDRESS,
} from "../../fixtures";
import {
  recordedLogins,
  recordedRecurringDonations,
  recordedRecurringStatusUpdates,
  recordedRecurringUpdates,
} from "../../fixtures/msw-handlers";

const forwarderAbi = parseAbi([
  "function setFlowrate(address token, address receiver, int96 flowrate)",
  "function getFlowrate(address token, address sender, address receiver) view returns (int96)",
]);
const superTokenAbi = parseAbi([
  "function upgradeByETH() payable",
  "function upgrade(uint256 amount)",
]);
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/** 100e18/mo floored to wei/second. */
const RATE_100_MO = 38580246913580n;

describeCommand("donate-recurring", {
  describeName:
    "Giveth > commands > donate-recurring <rate> <token> <more|less|total> to <slug>",
  module: "giveth",
  preamble: "load giveth",
  errorCases: [
    {
      name: "should fail without the mode keyword",
      script: `giveth:donate-recurring 100e18/mo ${XDAIX} to evmcrispr`,
      error: "invalid number of arguments",
    },
    {
      name: "should fail on a wrong mode keyword",
      script: `giveth:donate-recurring 100e18/mo ${XDAIX} maybe to evmcrispr`,
      error: 'expected keyword `total`, `more` or `less`, got "maybe"',
    },
    {
      name: "should fail on a wrong connector keyword",
      script: `giveth:donate-recurring 100e18/mo ${XDAIX} total into evmcrispr`,
      error: 'expected keyword "to", got "into"',
    },
    {
      name: "should reject negative rates",
      script: `giveth:donate-recurring -5 ${XDAIX} total to evmcrispr`,
      error: "<rate> must not be negative",
    },
    {
      name: "should reject a zero delta",
      script: `giveth:donate-recurring 0 ${XDAIX} more to evmcrispr`,
      error: "`more 0` does not change the stream",
    },
    {
      name: "should reject --tip with a delta mode",
      script: `giveth:donate-recurring 1e18/mo ${XDAIX} more to evmcrispr --tip 5`,
      error: "--tip is only valid with `total`",
    },
    {
      name: "should fail without an execution context",
      script: `giveth:donate-recurring 100e18/mo ${XDAIX} total to evmcrispr`,
      error:
        "donate-recurring requires an execution context with wallet access",
    },
  ],
});

describe("Giveth > commands > donate-recurring > with wallet", () => {
  let walletClient: WalletClient;
  const publicClient = getPublicClient();

  // The broadcast tests mutate real Superfluid stream state on the shared
  // anvil, and leftovers — from a sibling test or a previous run of the
  // suite (the trailing sim:fork test re-forks the node) — make later
  // creates/stops revert. Start from a pristine fork once, then rewind to
  // it before every test via snapshots (milliseconds, no re-fork).
  let snapshotId: unknown;

  beforeAll(async () => {
    walletClient = getWalletClients()[0];
    await resetAnvil();
    // The test account holds no xDAIx on the fork and not every test
    // wraps its own (the direct setFlowrate below streams without
    // --wrap): a fat cushion wrapped BEFORE the snapshot keeps every
    // test's deposit buffer solvent regardless of the fork block.
    await publicClient.request({
      method: "anvil_setBalance" as never,
      params: [walletClient.account!.address, "0x21e19e0c9bab2400000"] as never,
    });
    const wrapHash = await sendPadded({
      to: XDAIX,
      value: 500n * 10n ** 18n,
      data: encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "upgradeByETH",
            inputs: [],
            outputs: [],
            stateMutability: "payable",
          },
        ] as const,
        functionName: "upgradeByETH",
      }),
    });
    await publicClient.waitForTransactionReceipt({ hash: wrapHash });
    snapshotId = await publicClient.request({
      method: "evm_snapshot" as never,
    });
  });

  beforeEach(async () => {
    // Rewind to the pristine snapshot; a successful evm_revert consumes
    // the snapshot id, so take a fresh one for the next test.
    await publicClient.request({
      method: "evm_revert" as never,
      params: [snapshotId] as never,
    });
    snapshotId = await publicClient.request({
      method: "evm_snapshot" as never,
    });
    recordedLogins.length = 0;
    recordedRecurringDonations.length = 0;
    recordedRecurringUpdates.length = 0;
    recordedRecurringStatusUpdates.length = 0;
  });

  /** Broadcast with a wallet-style gas margin. viem submits the raw
   *  eth_estimateGas result as the gas limit, but Superfluid's setFlowrate
   *  call tree costs more when mined than when estimated: the CFA skips
   *  token.settleBalance while block.timestamp still equals the sender's
   *  flow-state timestamp (true during estimation, right after the
   *  previous flow tx) and settles a second later when the tx is mined.
   *  EIP-150's 63/64 split then starves the deepest frame, which the host
   *  reports as "CallUtils: target revert()". */
  const sendPadded = async (tx: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
  }) => {
    const account = walletClient.account!;
    const gas = await publicClient.estimateGas({ account, ...tx });
    return walletClient.sendTransaction({
      account,
      chain: gnosis,
      ...tx,
      gas: (gas * 3n) / 2n,
    });
  };

  const buildInterpreter = () => {
    const evm = new Interpreter(evml.registry, {
      account: walletClient.account!.address,
      transports: getTransports(),
    });
    evm.switchChainId(gnosis.id);
    return evm;
  };

  /** Signs SIWE messages and actually broadcasts txs to the anvil fork, so
   *  getFlowrate state is real across create → adjust → stop sequences. */
  const runBroadcasting = async (script: string) => {
    const account = walletClient.account!;
    const executed: TransactionAction[] = [];
    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "personal_sign") {
        return walletClient.signMessage({
          account,
          message: action.params[0],
        });
      }
      const tx = action as TransactionAction;
      const hash = await sendPadded({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}` | undefined,
        value: tx.value as bigint | undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        // Trace for the revert reason — receipts don't carry it and
        // replays aren't faithful to the failing context.
        let reason = "unknown";
        try {
          const trace = (await publicClient.request({
            method: "debug_traceTransaction" as never,
            params: [hash, { tracer: "callTracer" }] as never,
          })) as { error?: string; revertReason?: string; output?: string };
          reason = JSON.stringify({
            error: trace?.error,
            revertReason: trace?.revertReason,
            output: trace?.output,
          });
        } catch (e) {
          reason = `trace failed: ${String((e as Error).message).slice(0, 80)}`;
        }
        throw new Error(
          `test transaction reverted (${reason}): ${tx.to} ${tx.data}`,
        );
      }
      executed.push(tx);
      return { transactionHash: hash };
    };
    await buildInterpreter().interpret(
      `load giveth\n${script}`,
      actionCallback,
    );
    return executed;
  };

  const fakeHash = (i: number) => `0x${i.toString(16).padStart(64, "0")}`;

  /** donate.test.ts-style callback: signs but never broadcasts. */
  const runFake = async (script: string) => {
    const account = walletClient.account!;
    const executed: TransactionAction[] = [];
    const actionCallback = async (action: Action) => {
      if (isWalletAction(action) && action.method === "personal_sign") {
        return walletClient.signMessage({
          account,
          message: action.params[0],
        });
      }
      executed.push(action as TransactionAction);
      return { transactionHash: fakeHash(executed.length) };
    };
    await buildInterpreter().interpret(
      `load giveth\n${script}`,
      actionCallback,
    );
    return executed;
  };

  const flowrate = (receiver: string) =>
    publicClient.readContract({
      address: CFA_FORWARDER,
      abi: forwarderAbi,
      functionName: "getFlowrate",
      args: [XDAIX, walletClient.account!.address, receiver as `0x${string}`],
    });

  it(
    "runs the full lifecycle: create with wrap, adjust with more/less, stop",
    async () => {
      // Create: wrap 5 xDAI into xDAIx (headroom for the `more` step's extra
      // deposit buffer) and open the stream.
      let executed = await runBroadcasting(
        `giveth:donate-recurring 100e18/mo ${ZERO_ADDRESS} total to evmcrispr --wrap 5e18`,
      );
      expect(executed).to.have.length(2);
      expect(executed[0]!.to).to.eq(XDAIX);
      expect((executed[0] as any).value).to.eq(5n * 10n ** 18n);
      const setFlow = decodeFunctionData({
        abi: forwarderAbi,
        data: executed[1]!.data as `0x${string}`,
      });
      expect(setFlow.functionName).to.eq("setFlowrate");
      expect(setFlow.args).to.eql([
        XDAIX,
        getAddress(PROJECT_ANCHOR_GNOSIS),
        RATE_100_MO,
      ]);
      expect(await flowrate(PROJECT_ANCHOR_GNOSIS)).to.eq(RATE_100_MO);

      expect(recordedLogins).to.have.length(1);
      expect(recordedRecurringDonations).to.have.length(1);
      expect(recordedRecurringDonations[0]).to.include({
        projectId: 1350,
        networkId: gnosis.id,
        flowRate: RATE_100_MO.toString(),
        currency: gnosis.nativeCurrency.symbol,
        anonymous: false,
        isBatch: false,
      });
      expect(recordedRecurringDonations[0]!.txHash).to.match(
        /^0x[0-9a-f]{64}$/,
      );
      expect(recordedRecurringStatusUpdates).to.eql([
        { donationId: 1, status: "verified" },
      ]);

      // Increase by 100e18/mo.
      executed = await runBroadcasting(
        `giveth:donate-recurring 100e18/mo ${XDAIX} more to evmcrispr`,
      );
      expect(executed).to.have.length(1);
      expect(await flowrate(PROJECT_ANCHOR_GNOSIS)).to.eq(2n * RATE_100_MO);
      expect(recordedRecurringUpdates).to.have.length(1);
      expect(recordedRecurringUpdates[0]).to.include({
        projectId: 1350,
        flowRate: (2n * RATE_100_MO).toString(),
      });

      // Decrease by 50e18/mo.
      await runBroadcasting(
        `giveth:donate-recurring 50e18/mo ${XDAIX} less to evmcrispr`,
      );
      const afterLess = 2n * RATE_100_MO - (50n * 10n ** 18n) / 2592000n;
      expect(await flowrate(PROJECT_ANCHOR_GNOSIS)).to.eq(afterLess);
      expect(recordedRecurringUpdates[1]).to.include({
        flowRate: afterLess.toString(),
      });

      // Stop: delete the flow and mark the donation ended.
      executed = await runBroadcasting(
        `giveth:donate-recurring 0 ${XDAIX} total to evmcrispr`,
      );
      expect(executed).to.have.length(1);
      expect(await flowrate(PROJECT_ANCHOR_GNOSIS)).to.eq(0n);
      expect(recordedRecurringUpdates[2]).to.include({
        flowRate: "0",
        status: "ended",
      });
      // Ended streams get no "verified" bump: one per create/update above.
      expect(recordedRecurringStatusUpdates).to.have.length(3);
    },
    { timeout: 30_000 },
  );

  it(
    "falls back to creating the record when Giveth doesn't know the stream",
    async () => {
      // Open a stream directly on-chain, invisible to the (reset) mocked API.
      const hash = await sendPadded({
        to: CFA_FORWARDER,
        data: encodeFunctionData({
          abi: forwarderAbi,
          functionName: "setFlowrate",
          args: [XDAIX, PROJECT_ANCHOR_GNOSIS, RATE_100_MO],
        }),
      });
      await publicClient.waitForTransactionReceipt({ hash });

      await runBroadcasting(
        `giveth:donate-recurring 200e18/mo ${XDAIX} total to evmcrispr`,
      );
      // update → "Recurring donation not found." → createRecurringDonation.
      expect(recordedRecurringUpdates).to.have.length(0);
      expect(recordedRecurringDonations).to.have.length(1);
      expect(recordedRecurringDonations[0]).to.include({
        flowRate: (2n * RATE_100_MO).toString(),
      });

      // Clean up the stream for the tests that follow.
      await runBroadcasting(
        `giveth:donate-recurring 0 ${XDAIX} total to evmcrispr`,
      );
      expect(await flowrate(PROJECT_ANCHOR_GNOSIS)).to.eq(0n);
    },
    { timeout: 30_000 },
  );

  it(
    "streams a --tip on top to the Giveth anchor and leaves it alone on stop",
    async () => {
      const tipRate = (RATE_100_MO * 1000n) / 10000n;
      let executed = await runBroadcasting(
        `giveth:donate-recurring 100e18/mo ${ZERO_ADDRESS} total to evmcrispr --wrap 1e18 --tip 10`,
      );
      expect(executed).to.have.length(3);
      const tipFlow = decodeFunctionData({
        abi: forwarderAbi,
        data: executed[2]!.data as `0x${string}`,
      });
      expect(tipFlow.args).to.eql([
        XDAIX,
        getAddress(TIP_ANCHOR_GNOSIS),
        tipRate,
      ]);
      expect(await flowrate(PROJECT_ANCHOR_GNOSIS)).to.eq(RATE_100_MO);
      expect(await flowrate(TIP_ANCHOR_GNOSIS)).to.eq(tipRate);

      expect(recordedRecurringDonations).to.have.length(2);
      expect(recordedRecurringDonations[0]).to.include({ projectId: 1350 });
      expect(recordedRecurringDonations[1]).to.include({
        projectId: 1,
        flowRate: tipRate.toString(),
      });
      expect(recordedRecurringStatusUpdates).to.have.length(2);

      // Stopping the project donation must not touch the tip stream.
      executed = await runBroadcasting(
        `giveth:donate-recurring 0 ${XDAIX} total to evmcrispr`,
      );
      expect(executed).to.have.length(1);
      expect(await flowrate(PROJECT_ANCHOR_GNOSIS)).to.eq(0n);
      expect(await flowrate(TIP_ANCHOR_GNOSIS)).to.eq(tipRate);

      // Stop the tip stream like any recurring donation, keeping state clean.
      executed = await runBroadcasting(
        `giveth:donate-recurring 0 ${XDAIX} total to the-giveth-community-of-makers`,
      );
      expect(executed).to.have.length(1);
      expect(await flowrate(TIP_ANCHOR_GNOSIS)).to.eq(0n);
    },
    { timeout: 30_000 },
  );

  it(
    "resolves an underlying token to its SuperToken, approving and wrapping",
    async () => {
      const executed = await runFake(
        `giveth:donate-recurring 10e18/mo ${USDC} total to evmcrispr --wrap 100e6`,
      );

      expect(executed).to.have.length(3);
      const approve = decodeFunctionData({
        abi: erc20Abi,
        data: executed[0]!.data as `0x${string}`,
      });
      expect(executed[0]!.to).to.eq(USDC);
      expect(approve.args).to.eql([USDCX, 100n * 10n ** 6n]);

      const upgrade = decodeFunctionData({
        abi: superTokenAbi,
        data: executed[1]!.data as `0x${string}`,
      });
      expect(executed[1]!.to).to.eq(USDCX);
      expect(upgrade.functionName).to.eq("upgrade");
      // 6-decimal underlying scaled to the 18-decimal SuperToken amount.
      expect(upgrade.args).to.eql([100n * 10n ** 18n]);

      const setFlow = decodeFunctionData({
        abi: forwarderAbi,
        data: executed[2]!.data as `0x${string}`,
      });
      expect(setFlow.args).to.eql([
        USDCX,
        getAddress(PROJECT_ANCHOR_GNOSIS),
        (10n * 10n ** 18n) / 2592000n,
      ]);

      // The donation is keyed on the UNDERLYING token's symbol.
      expect(recordedRecurringDonations).to.have.length(1);
      expect(recordedRecurringDonations[0]).to.include({ currency: "USDC" });
    },
    { timeout: 30_000 },
  );

  it("fails on projects without an anchor contract on the chain", async () => {
    let error: Error | undefined;
    try {
      await runFake(
        `giveth:donate-recurring 100e18/mo ${XDAIX} total to wayback-machine`,
      );
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include(
      "doesn't have an anchor contract on this chain",
    );
  });

  it("fails early when the SuperToken balance can't cover the buffer", async () => {
    let error: Error | undefined;
    try {
      await runFake(
        `giveth:donate-recurring 1000000e18/mo ${XDAIX} total to evmcrispr`,
      );
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).to.include("deposit buffer");
    expect(error?.message).to.include("--wrap");
  });

  it(
    "simulates inside sim:fork without signing in or recording to Giveth",
    async () => {
      // No outer actionCallback: sim:fork supplies its own fork executor.
      await buildInterpreter().interpret(`load giveth
load sim
sim:fork --using anvil (
  sim:set-balance @me 10e18
  giveth:donate-recurring 100e18/mo ${ZERO_ADDRESS} total to evmcrispr --wrap 1e18
)`);

      expect(recordedLogins).to.have.length(0);
      expect(recordedRecurringDonations).to.have.length(0);
      expect(recordedRecurringUpdates).to.have.length(0);
    },
    { timeout: 30_000 },
  );
});
