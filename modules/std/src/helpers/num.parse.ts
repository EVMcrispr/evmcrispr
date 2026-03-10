import { Num, defineHelper } from "@evmcrispr/sdk";
import { parseUnits } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "num.parse",
  description: "Parse a decimal string with a given number of decimals (like parseUnits).",
  returnType: "number",
  args: [
    { name: "value", type: "any" },
    { name: "decimals", type: "number" },
  ],
  async run(_, { value, decimals }) {
    const d = Number(Num.coerce(decimals).toBigInt());
    return new Num(parseUnits(String(value), d));
  },
});
