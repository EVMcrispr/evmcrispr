import { defineHelper, Num } from "@evmcrispr/sdk";
import type Circom from "..";
import { keccakToField } from "../utils/field";

export default defineHelper<Circom>({
  name: "field.hash",
  description:
    "Hash hex bytes with keccak256 and reduce the digest into the BN254 scalar field, the standard way to map addresses, strings or arbitrary data into a circuit input.",
  returnType: "number",
  args: [
    {
      name: "data",
      type: "bytes",
      description:
        "Hex bytes to hash (compose multiple values with @abi.encodePacked)",
    },
  ],
  async run(_, { data }) {
    return Num.fromBigInt(keccakToField(data));
  },
});
