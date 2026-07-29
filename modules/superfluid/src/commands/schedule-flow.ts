import type { Action } from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { FLOW_SCHEDULER } from "../addresses";
import {
  buildOperatorGrantActions,
  PERM_CREATE,
  PERM_DELETE,
} from "../utils/acl";
import { buildApprovalActions } from "../utils/approval";
import { skipPrereqs } from "../utils/plan";
import { requireCore, requirePeripheral } from "../utils/protocol";
import {
  parseAmount,
  parseDuration,
  parseFlowRate,
  parseFlowRateOrZero,
} from "../utils/rate";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "schedule-flow",
  description:
    "Schedule a stream to start and/or end at future timestamps, executed by Superfluid's keeper network. Automatically grants the FlowScheduler the flow-operator permissions it needs (create for --start, delete for --end) plus a SuperToken allowance when --start-amount is set. At least one of --start / --end is required; execution is permissionless but not guaranteed if the grants are revoked.",
  args: [
    {
      name: "rate",
      type: "number",
      description:
        "Flow rate in wei per second (e.g. 1000e18/mo); may be 0 for end-only schedules",
    },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "receiver", type: "address", description: "Stream receiver" },
  ],
  opts: [
    {
      name: "start",
      type: "number",
      description: "Unix timestamp at which the keeper opens the stream",
    },
    {
      name: "start-window",
      type: "number",
      description:
        "How long after --start the keeper may still open the stream (default 3d)",
    },
    {
      name: "end",
      type: "number",
      description: "Unix timestamp at which the keeper closes the stream",
    },
    {
      name: "start-amount",
      type: "number",
      description:
        "Optional lump-sum SuperToken transfer when the stream starts (needs an allowance, granted automatically)",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic permission grant and allowance actions",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { rate, token, to, receiver }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await requireCore(module);
    const scheduler = requirePeripheral(
      FLOW_SCHEDULER,
      chainId,
      "FlowScheduler",
    );
    const superToken = await resolveSuperToken(module, token);

    const start =
      opts.start === undefined ? 0n : parseAmount(opts.start, "--start");
    const end = opts.end === undefined ? 0n : parseAmount(opts.end, "--end");
    if (start === 0n && end === 0n) {
      throw new ErrorException(
        "schedule-flow needs at least one of --start or --end",
      );
    }
    const startWindow =
      opts["start-window"] === undefined
        ? 259200n // 3d — how late the keeper may still start the stream
        : parseDuration(opts["start-window"], "--start-window");
    const startAmount =
      opts["start-amount"] === undefined
        ? 0n
        : parseAmount(opts["start-amount"], "--start-amount");
    if (startAmount > 0n && start === 0n) {
      throw new ErrorException("--start-amount requires --start");
    }

    const flowRate =
      start > 0n
        ? parseFlowRate(rate, "<rate>")
        : parseFlowRateOrZero(rate, "<rate>");

    const account = await module.getConnectedAccount(true);
    const actions: Action[] = [];

    if (!skipPrereqs(opts)) {
      const permissions =
        (start > 0n ? PERM_CREATE : 0) | (end > 0n ? PERM_DELETE : 0);
      actions.push(
        ...(await buildOperatorGrantActions(
          module,
          superToken,
          account,
          scheduler,
          permissions,
          flowRate,
        )),
      );
      if (startAmount > 0n) {
        actions.push(
          ...(await buildApprovalActions(
            module,
            superToken,
            account,
            scheduler,
            startAmount,
          )),
        );
      }
    }

    actions.push(
      encodeAction(
        scheduler,
        "createFlowSchedule(address,address,uint32,uint32,int96,uint256,uint32,bytes,bytes)",
        [
          superToken,
          receiver,
          Num.fromBigInt(start),
          Num.fromBigInt(startWindow),
          Num.fromBigInt(flowRate),
          Num.fromBigInt(startAmount),
          Num.fromBigInt(end),
          "0x",
          "0x",
        ],
      ),
    );
    return actions;
  },
});
