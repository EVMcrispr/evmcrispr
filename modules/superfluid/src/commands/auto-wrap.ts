import type { Action } from "@evmcrispr/sdk";
import {
  defineCommand,
  ErrorException,
  encodeAction,
  Num,
} from "@evmcrispr/sdk";
import { maxUint256 } from "viem";
import type Superfluid from "..";
import { AUTOWRAP_MANAGER, AUTOWRAP_STRATEGY } from "../addresses";
import { buildApprovalActions } from "../utils/approval";
import { skipPrereqs } from "../utils/plan";
import { requireCore, requirePeripheral } from "../utils/protocol";
import { parseAmount, parseDuration } from "../utils/rate";
import {
  getUnderlyingToken,
  isPureSuperToken,
  resolveSuperToken,
} from "../utils/supertoken";

/** Far-future default expiry (year ~3000), matching Superfluid's own UI. */
const DEFAULT_EXPIRY = 32503680000n;

export default defineCommand<Superfluid>({
  name: "auto-wrap",
  description:
    "Keep a SuperToken balance topped up automatically: when the balance falls below --lower seconds of outflow runway, Superfluid's keepers wrap enough underlying to reach --upper seconds. WARNING: by default this grants the wrap strategy an unlimited allowance on the underlying token (matching Superfluid's own UI, since the schedule is open-ended) — cap it with --allowance.",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
  ],
  opts: [
    {
      name: "lower",
      type: "number",
      description:
        "Runway threshold that triggers a wrap, in time units (default 7d; protocol minimum 2d)",
    },
    {
      name: "upper",
      type: "number",
      description:
        "Runway to top up to when triggered, in time units (default 14d; protocol minimum 7d)",
    },
    {
      name: "expiry",
      type: "number",
      description: "Unix timestamp when the schedule expires (default: never)",
    },
    {
      name: "allowance",
      type: "number",
      description:
        "Cap the underlying allowance granted to the wrap strategy (default: unlimited)",
    },
    {
      name: "no-approve",
      type: "bool",
      description: "Skip the automatic allowance action",
    },
  ],
  async run(module, { token }, { opts }) {
    const chainId = await requireCore(module);
    const manager = requirePeripheral(AUTOWRAP_MANAGER, chainId, "Auto-Wrap");
    const strategy = requirePeripheral(
      AUTOWRAP_STRATEGY,
      chainId,
      "Auto-Wrap strategy",
    );
    const superToken = await resolveSuperToken(module, token);
    const underlying = await getUnderlyingToken(module, superToken);
    if (isPureSuperToken(underlying)) {
      throw new ErrorException(
        `${superToken} has no underlying token — auto-wrap only works for wrapper SuperTokens`,
      );
    }

    const lower =
      opts.lower === undefined ? 604800n : parseDuration(opts.lower, "--lower");
    const upper =
      opts.upper === undefined
        ? 1209600n
        : parseDuration(opts.upper, "--upper");
    if (upper <= lower) {
      throw new ErrorException("--upper must be greater than --lower");
    }
    const expiry =
      opts.expiry === undefined
        ? DEFAULT_EXPIRY
        : parseAmount(opts.expiry, "--expiry");
    const allowance =
      opts.allowance === undefined
        ? maxUint256
        : parseAmount(opts.allowance, "--allowance");

    const account = await module.getConnectedAccount(true);
    const actions: Action[] = [];
    if (!skipPrereqs(opts)) {
      actions.push(
        ...(await buildApprovalActions(
          module,
          underlying,
          account,
          strategy,
          allowance,
        )),
      );
    }
    actions.push(
      encodeAction(
        manager,
        "createWrapSchedule(address,address,address,uint64,uint64,uint64)",
        [
          superToken,
          strategy,
          underlying,
          Num.fromBigInt(expiry),
          Num.fromBigInt(lower),
          Num.fromBigInt(upper),
        ],
      ),
    );
    return actions;
  },
});
