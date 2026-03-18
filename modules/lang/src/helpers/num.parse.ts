import { Num, defineHelper } from "@evmcrispr/sdk";
import { parseUnits } from "viem";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "num.parse",
  description: "Parse a decimal string with a given number of decimals (like parseUnits).",
  returnType: "number",
  args: [
    { name: "value", type: "any", description: "Input value" },
    { name: "decimals", type: "number", description: "Number of decimal places" },
  ],
  async run(_, { value, decimals }) {
    const d = Num(decimals).toNumber();
    return Num(parseUnits(String(value), d));
  },
});
