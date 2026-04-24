import { Num, defineHelper } from "@evmcrispr/sdk";
import { formatUnits } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "num.format",
  description: "Format a number with decimal places (like formatUnits).",
  returnType: "string",
  args: [
    { name: "value", type: "number", description: "Input value" },
    {
      name: "decimals",
      type: "number",
      description: "Number of decimal places",
    },
  ],
  async run(_, { value, decimals }) {
    const v = Num(value).toBigInt();
    const d = Num(decimals).toNumber();
    return formatUnits(v, d);
  },
});
