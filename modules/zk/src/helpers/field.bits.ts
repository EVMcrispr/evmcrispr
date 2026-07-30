import { defineHelper, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseFieldInput, toBits } from "../utils/field";

export default defineHelper<Zk>({
  name: "field.bits",
  description:
    "Decompose a value into its bits, least-significant first — e.g. a Merkle path index into the per-level indices a circuit expects.",
  returnType: "array",
  args: [
    {
      name: "value",
      type: "number",
      description: "Value to decompose (must fit in count bits)",
    },
    {
      name: "count",
      type: "number",
      description: "Number of bits to produce (1-254)",
    },
  ],
  async run(_, { value, count }) {
    return toBits(
      parseFieldInput(value, "value"),
      Number(Num(count).toBigInt()),
    ).map(Num.fromBigInt);
  },
});
