import { defineHelper, Num } from "@evmcrispr/sdk";
import type { Address } from "viem";
import type Gelato from "..";
import { gasTankBalances } from "./balance";

export default defineHelper<Gelato>({
  name: "withdrawn",
  batchable: false,
  description:
    "USDC a sponsor has withdrawn from the Gelato Gas Tank in total (6 decimals), read from Polygon.",
  returnType: "number",
  args: [
    {
      name: "sponsor",
      type: "address",
      description: "Gas Tank sponsor (defaults to the connected account)",
      optional: true,
    },
  ],
  async run(module, { sponsor }) {
    const account =
      (sponsor as Address | undefined) ?? (await module.getConnectedAccount());
    return Num.fromBigInt((await gasTankBalances(module, account)).withdrawn);
  },
});
