import { namehash as _namehash } from "viem";
import { normalize } from "viem/ens";

import { defineHelper } from "../../../utils";
import type { Std } from "../Std";

export const namehash = defineHelper<Std>({
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
