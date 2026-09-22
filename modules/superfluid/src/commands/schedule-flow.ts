import type { Action } from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam, snapshotSmartAmount } from "@evmcrispr/sdk/onchain";
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
  smartSupport: { kind: "runtime" },
  name: "schedule-flow",
  primaryCall: -1,
  description:
    "Schedule a stream to start and/or end at future timestamps, executed by Superfluid's keeper network. Automatically grants the FlowScheduler the flow-operator permissions it needs (create for --start, delete for --end) plus a SuperToken allowance when --start-amount is set. At least one of --start / --end is required; execution is permissionless but not guaranteed if the grants are revoked.",
  args: [
    {
      name: "rate",
      type: "number",
      runtime: true,
      description:
        "Flow rate in wei per second (e.g. 1000e18/mo); may be 0 for end-only schedules",
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
      description: "Stream receiver",
    },
  ],
  opts: [
    {
      name: "start",
      type: "number",
      runtime: true,
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
      runtime: true,
      description: "Unix timestamp at which the keeper closes the stream",
    },
    {
      name: "start-amount",
      type: "number",
      runtime: true,
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
      opts.start === undefined
        ? 0n
        : parseAmount(opts.start, "--start", module);
    const end =
      opts.end === undefined ? 0n : parseAmount(opts.end, "--end", module);
    if (start === 0n && end === 0n) {
      throw new ErrorException(
        "schedule-flow needs at least one of --start or --end",
      );
    }
    const startWindow =
      opts["start-window"] === undefined
        ? 259200n // 3d — how late the keeper may still start the stream
        : parseDuration(opts["start-window"], "--start-window", module);
    const startAmount = await snapshotSmartAmount(
      module,
      opts["start-amount"] === undefined
        ? 0n
        : parseAmount(opts["start-amount"], "--start-amount", module),
    );
    if (opts["start-amount"] !== undefined && start === 0n) {
      throw new ErrorException("--start-amount requires --start");
    }

    const flowRate =
      opts.start !== undefined
        ? parseFlowRate(rate, "<rate>", module)
        : parseFlowRateOrZero(rate, "<rate>", module);

    const account = await module.getSender();
    const actions: Action[] = [];

    if (!skipPrereqs(opts)) {
      const permissions =
        (opts.start !== undefined ? PERM_CREATE : 0) |
        (opts.end !== undefined ? PERM_DELETE : 0);
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
      if (opts["start-amount"] !== undefined) {
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
          amountParam(start),
          amountParam(startWindow),
          amountParam(flowRate),
          amountParam(startAmount),
          amountParam(end),
          "0x",
          "0x",
        ],
      ),
    );
    return actions;
  },
});
