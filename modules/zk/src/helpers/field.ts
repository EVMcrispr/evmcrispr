import { defineHelper, Num } from "@evmcrispr/sdk";
import type Zk from "..";
import { parseFieldInput } from "../utils/field";

export default defineHelper<Zk>({
  name: "field",
  description:
    "Reduce a value into the BN254 scalar field: values >= the field prime wrap around and negative values wrap to p - |x| (the circom convention).",
  returnType: "number",
  args: [
    {
      name: "value",
      type: "any",
      description:
        "Number, decimal string, or hex/bytes32 value to reduce into the field",
    },
  ],
  async run(_, { value }) {
    return Num.fromBigInt(parseFieldInput(value, "value"));
  },
});
