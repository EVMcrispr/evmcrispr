import type { Action } from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
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
  name: "vest",
  description:
    "Vest a total SuperToken amount to a receiver over a duration through the VestingScheduler (V3), executed by Superfluid's keeper network. With --cliff, everything accrued up to the cliff is transferred at once when it passes, then the rest streams. Automatically grants the scheduler flow-operator rights and the SuperToken allowance it needs; execution is permissionless but not guaranteed if the grants are revoked.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Total amount to vest, in base units (18 decimals)",
    },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "receiver", type: "address", description: "Vesting receiver" },
    { name: "over", type: "command", description: "Keyword `over`" },
    {
      name: "duration",
      type: "number",
      description: "Total vesting duration, e.g. 1y or 730d",
    },
  ],
  opts: [
    {
      name: "start",
      type: "number",
      description: "Unix timestamp at which vesting starts (defaults to now)",
    },
    {
      name: "cliff",
      type: "number",
      description:
        "Cliff period from the start (e.g. 90d): nothing until it passes, then the accrued amount at once",
    },
    {
      name: "claimable-for",
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
    const total = parseAmount(amount);
    const totalDuration = parseDuration(duration, "<duration>");
    const start =
      opts.start === undefined ? 0n : parseAmount(opts.start, "--start");
    const cliff =
      opts.cliff === undefined ? 0n : parseDuration(opts.cliff, "--cliff");
    const claimPeriod =
      opts["claimable-for"] === undefined
        ? 0n
        : parseDuration(opts["claimable-for"], "--claimable-for");
    if (cliff >= totalDuration) {
      throw new ErrorException(
        "--cliff must be shorter than the total duration",
      );
    }

    const flowRate = total / totalDuration;
    if (flowRate <= 0n) {
      throw new ErrorException(
        "<amount> over <duration> yields a flow rate of 0 wei/second",
      );
    }

    const account = await module.getConnectedAccount(true);
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
      const allowance =
        total + flowRate * (BigInt(startValidAfter) + BigInt(endValidBefore));
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
          Num.fromBigInt(total),
          Num.fromBigInt(totalDuration),
          Num.fromBigInt(start),
          Num.fromBigInt(cliff),
          Num.fromBigInt(claimPeriod),
        ],
      ),
    );
    return actions;
  },
});
