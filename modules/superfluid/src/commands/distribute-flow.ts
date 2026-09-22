import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
} from "@evmcrispr/sdk";
import { amountParam } from "@evmcrispr/sdk/onchain";
import type Superfluid from "..";
import { GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";
import { parseFlowRateOrZero } from "../utils/rate";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "distribute-flow",
  description:
    "Stream a SuperToken to all members of a GDA pool, split pro-rata to their units as they change over time. Rates are wei per second — use a rate literal like 1000e18/mo; a rate of 0 stops the distribution flow. Like any stream, it locks a buffer deposit from the distributor.",
  args: [
    {
      name: "rate",
      type: "number",
      runtime: true,
      description:
        "Flow rate in wei per second (e.g. 1000e18/mo), or 0 to stop",
    },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    {
      name: "pool",
      type: "address",
      runtime: true,
      description: "GDA pool address",
    },
  ],
  opts: [
    {
      name: "from",
      type: "address",
      runtime: true,
      description:
        "Distributor account (defaults to the connected account; pools only accept third-party distributors when created with --open-distribution)",
    },
  ],
  completions: { to: () => [fieldItem("to")] },
  async run(module, { rate, token, to, pool }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    await requireCore(module);
    const superToken = await resolveSuperToken(module, token);
    const flowRate = parseFlowRateOrZero(rate, "<rate>", module);
    const account = await module.getSender();
    const from = opts.from ?? account;
    return [
      encodeAction(
        GDA_FORWARDER,
        "distributeFlow(address,address,address,int96,bytes)",
        [superToken, from, pool, amountParam(flowRate), "0x"],
      ),
    ];
  },
});
