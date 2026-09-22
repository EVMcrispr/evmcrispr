import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import {
  amountParam,
  isRuntimeValue,
  type SmartAmount,
} from "@evmcrispr/sdk/onchain";
import type Superfluid from "..";
import { GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "set-units",
  description:
    "Set a member's share units in a GDA pool (admin only). Units are plain unitless weights: a member with 3 units earns 3x what a member with 1 unit earns. Setting 0 removes the member from future distributions.",
  args: [
    {
      name: "units",
      type: "number",
      runtime: true,
      description: "New unit count for the member (0 removes them)",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "member",
      type: "address",
      runtime: true,
      description: "Pool member",
    },
    { name: "in", type: "command", description: "Keyword `in`" },
    {
      name: "pool",
      type: "address",
      runtime: true,
      description: "GDA pool address",
    },
  ],
  completions: {
    to: () => [fieldItem("to")],
    in: () => [fieldItem("in")],
  },
  async run(module, { units, to, member, in: inKeyword, pool }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    if (inKeyword !== "in") {
      throw new ErrorException(`expected keyword "in", got "${inKeyword}"`);
    }
    await requireCore(module);
    let parsed: SmartAmount;
    try {
      parsed = isRuntimeValue(units) ? units : Num(units).toBigInt();
    } catch {
      throw new ErrorException(`<units> must be a number, got ${units}`);
    }
    if (!isRuntimeValue(parsed) && (parsed < 0n || parsed > 2n ** 128n - 1n)) {
      throw new ErrorException("<units> must fit in uint128");
    }
    return [
      encodeAction(
        GDA_FORWARDER,
        "updateMemberUnits(address,address,uint128,bytes)",
        [pool, member, amountParam(parsed), "0x"],
      ),
    ];
  },
});
