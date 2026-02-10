import { defineHelper } from "@evmcrispr/sdk";
import { namehash as _namehash } from "viem";
import { normalize } from "viem/ens";
import type Std from "..";

export default defineHelper<Std>({
  name: "namehash",
  args: [{ name: "name", type: "string" }],
  async run(_, { name }) {
    try {
      normalize(name);
      return _namehash(name);
    } catch (_e) {
      throw new Error(
        "Invalid ENS name. Please check the value you are passing to @namehash",
      );
    }
  },
});
