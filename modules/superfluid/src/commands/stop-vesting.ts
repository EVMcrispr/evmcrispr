import {
  coerceBoolean,
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { VESTING_SCHEDULER_V3 } from "../addresses";
import { requireCore, requirePeripheral } from "../utils/protocol";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "stop-vesting",
  description:
    "Delete a pending vesting schedule, or end a running one immediately with --now true (the receiver keeps what has vested so far).",
  args: [
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "receiver", type: "address", description: "Vesting receiver" },
  ],
  opts: [
    {
      name: "now",
      type: "bool",
      description:
        "End a running schedule immediately instead of deleting a pending one",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { token, to, receiver }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    const chainId = await requireCore(module);
    const scheduler = requirePeripheral(
      VESTING_SCHEDULER_V3,
      chainId,
      "VestingScheduler",
    );
    const superToken = await resolveSuperToken(module, token);
    const endNow = opts.now !== undefined && coerceBoolean(opts.now);
    const fn = endNow
      ? "endVestingScheduleNow(address,address)"
      : "deleteVestingSchedule(address,address)";
    return [encodeAction(scheduler, fn, [superToken, receiver])];
  },
});
