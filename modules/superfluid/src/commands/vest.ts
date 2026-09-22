import type { Action } from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import {
  amountParam,
  assertSmartComparison,
  isRuntimeValue,
  positiveRuntimeAmount,
  smartArithmetic,
  snapshotSmartAmount,
} from "@evmcrispr/sdk/onchain";
import type { Abi } from "viem";
import type Superfluid from "..";
import { vestingSchedulerAbi } from "../abis";
import { VESTING_SCHEDULER_V3 } from "../addresses";
import { buildOperatorGrantActions, PERM_FULL } from "../utils/acl";
import { buildApprovalActions } from "../utils/approval";
import { skipPrereqs } from "../utils/plan";
import { requireCore, requirePeripheral } from "../utils/protocol";
import { parseAmount, parseDuration } from "../utils/rate";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "vest",
  primaryCall: -1,
  description:
    "Vest a total SuperToken amount to a receiver over a duration through the VestingScheduler (V3), executed by Superfluid's keeper network. With --cliff, everything accrued up to the cliff is transferred at once when it passes, then the rest streams. Automatically grants the scheduler flow-operator rights and the SuperToken allowance it needs; execution is permissionless but not guaranteed if the grants are revoked.",
  args: [
    {
      name: "amount",
      snapshot: true,
      type: "number",
      runtime: true,
      description: "Total amount to vest, in base units (18 decimals)",
    },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "receiver",
      type: "address",
      runtime: true,
      description: "Vesting receiver",
    },
    { name: "over", type: "command", description: "Keyword `over`" },
    {
      name: "duration",
      runtime: true,
      type: "number",
      description: "Total vesting duration, e.g. 1y or 730d",
    },
  ],
  opts: [
    {
      name: "start",
      type: "number",
      runtime: true,
      description: "Unix timestamp at which vesting starts (defaults to now)",
    },
    {
      name: "cliff",
      runtime: true,
      type: "number",
      description:
        "Cliff period from the start (e.g. 90d): nothing until it passes, then the accrued amount at once",
    },
    {
      name: "claimable-for",
      runtime: true,
      type: "number",
      description:
        "Make the schedule claimable: the receiver must claim within this period after the start or it never begins",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic permission grant and allowance actions",
    },
  ],
  completions: {
    to: () => [fieldItem("to")],
    over: () => [fieldItem("over")],
  },
  async run(module, { amount, token, to, receiver, over, duration }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    if (over !== "over") {
      throw new ErrorException(`expected keyword "over", got "${over}"`);
    }
    const chainId = await requireCore(module);
    const scheduler = requirePeripheral(
      VESTING_SCHEDULER_V3,
      chainId,
      "VestingScheduler",
    );
    const superToken = await resolveSuperToken(module, token);
    const total = parseAmount(amount, undefined, module);
    const totalDuration = await snapshotSmartAmount(
      module,
      parseDuration(duration, "<duration>", module),
    );
    const start =
      opts.start === undefined
        ? 0n
        : parseAmount(opts.start, "--start", module);
    const cliff = await snapshotSmartAmount(
      module,
      opts.cliff === undefined
        ? 0n
        : parseDuration(opts.cliff, "--cliff", module),
    );
    const claimPeriod =
      opts["claimable-for"] === undefined
        ? 0n
        : parseDuration(opts["claimable-for"], "--claimable-for", module);
    await assertSmartComparison(
      module,
      cliff,
      "<",
      totalDuration,
      "--cliff must be shorter than the total duration",
    );

    let flowRate = await smartArithmetic(module, "/", total, totalDuration);
    if (isRuntimeValue(flowRate))
      flowRate = positiveRuntimeAmount(module, flowRate);
    if (!isRuntimeValue(flowRate) && flowRate <= 0n) {
      throw new ErrorException(
        "<amount> over <duration> yields a flow rate of 0 wei/second",
      );
    }

    const account = await module.getSender();
    const actions: Action[] = [];

    if (!skipPrereqs(opts)) {
      actions.push(
        ...(await buildOperatorGrantActions(
          module,
          superToken,
          account,
          scheduler,
          PERM_FULL,
          flowRate,
        )),
      );
      // Upper bound on what the scheduler may transferFrom the sender:
      // cliff + remainder are both <= total, plus the late-start/early-end
      // compensations bounded by the scheduler's validity constants.
      const client = await module.getClient();
      const [startValidAfter, endValidBefore] = (await Promise.all([
        client.readContract({
          address: scheduler,
          abi: vestingSchedulerAbi as Abi,
          functionName: "START_DATE_VALID_AFTER",
        }),
        client.readContract({
          address: scheduler,
          abi: vestingSchedulerAbi as Abi,
          functionName: "END_DATE_VALID_BEFORE",
        }),
      ])) as [number, number];
      const allowance = await smartArithmetic(
        module,
        "+",
        total,
        await smartArithmetic(
          module,
          "*",
          flowRate,
          BigInt(startValidAfter) + BigInt(endValidBefore),
        ),
      );
      actions.push(
        ...(await buildApprovalActions(
          module,
          superToken,
          account,
          scheduler,
          allowance,
        )),
      );
    }

    actions.push(
      encodeAction(
        scheduler,
        "createVestingScheduleFromAmountAndDuration(address,address,uint256,uint32,uint32,uint32,uint32)",
        [
          superToken,
          receiver,
          amountParam(total),
          amountParam(totalDuration),
          amountParam(start),
          amountParam(cliff),
          amountParam(claimPeriod),
        ],
      ),
    );
    return actions;
  },
});
