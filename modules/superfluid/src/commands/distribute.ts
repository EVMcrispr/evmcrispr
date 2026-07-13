import {
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  Num,
} from "@evmcrispr/sdk";
import type Superfluid from "..";
import { GDA_FORWARDER } from "../addresses";
import { requireCore } from "../utils/protocol";
import { parseAmount } from "../utils/rate";
import { resolveSuperToken } from "../utils/supertoken";

export default defineCommand<Superfluid>({
  name: "distribute",
  description:
    "Distribute a SuperToken amount instantly to all members of a GDA pool, pro-rata to their units. The actual amount may round down slightly so every unit receives the same integer share.",
  args: [
    {
      name: "amount",
      type: "number",
      description: "Amount to distribute, in base units (18 decimals)",
    },
    {
      name: "token",
      type: "supertoken",
      description: "SuperToken symbol (e.g. USDCx) or address",
    },
    { name: "to", type: "command", description: "Keyword `to`" },
    { name: "pool", type: "address", description: "GDA pool address" },
  ],
  opts: [
    {
      name: "from",
      type: "address",
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
    const superToken = await resolveSuperToken(module, token);
    const parsed = parseAmount(amount);
    const account = await module.getConnectedAccount(true);
    const from = opts.from ?? account;
    return [
      encodeAction(
        GDA_FORWARDER,
        "distribute(address,address,address,uint256,bytes)",
        [superToken, from, pool, Num.fromBigInt(parsed), "0x"],
      ),
    ];
  },
});
