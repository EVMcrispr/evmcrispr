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
import { parseAmount } from "../utils/rate";
import { resolveSmartSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  smartSupport: { kind: "runtime" },
  name: "distribute",
  description:
    "Distribute a SuperToken amount instantly to all members of a GDA pool, pro-rata to their units. The actual amount may round down slightly so every unit receives the same integer share.",
  args: [
    {
      name: "amount",
      type: "number",
      runtime: true,
      description: "Amount to distribute, in base units (18 decimals)",
    },
    {
      name: "token",
      runtime: true,
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
  async run(module, { amount, token, to, pool }, { opts }) {
    if (to !== "to") {
      throw new ErrorException(`expected keyword "to", got "${to}"`);
    }
    await requireCore(module);
    const superToken = await resolveSmartSuperToken(module, token);
    const parsed = parseAmount(amount, undefined, module);
    const account = await module.getSender();
    const from = opts.from ?? account;
    return [
      encodeAction(
        GDA_FORWARDER,
        "distribute(address,address,address,uint256,bytes)",
        [superToken, from, pool, amountParam(parsed), "0x"],
      ),
    ];
  },
});
