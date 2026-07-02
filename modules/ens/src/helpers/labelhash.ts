import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { labelhash as _labelhash } from "viem";
import { normalize } from "viem/ens";
import type Ens from "..";

export default defineHelper<Ens>({
  name: "labelhash",
  description: "Compute the ENS labelhash of a single label.",
  returnType: "bytes32",
  args: [
    {
      name: "label",
      type: "string",
      description: "Single ENS label (e.g. `vitalik`, no dots)",
    },
  ],
  async run(_, { label }, { node }) {
    if (label.includes(".")) {
      throw new HelperFunctionError(
        node,
        `labels cannot contain dots; use @namehash for full names`,
      );
    }
    try {
      return _labelhash(normalize(label));
    } catch (_e) {
      throw new HelperFunctionError(
        node,
        "Invalid ENS label. Please check the value you are passing to @labelhash",
      );
    }
  },
});
