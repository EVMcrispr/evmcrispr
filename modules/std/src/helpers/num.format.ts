import { Num, defineHelper } from "@evmcrispr/sdk";
import { formatUnits } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "num.format",
  description: "Format a number with decimal places (like formatUnits).",
  returnType: "string",
  args: [
    { name: "value", type: "number" },
    { name: "decimals", type: "number" },
  ],
  async run(_, { value, decimals }) {
    const v = Num.coerce(value).toBigInt();
    const d = Number(Num.coerce(decimals).toBigInt());
    return formatUnits(v, d);
  },
});
