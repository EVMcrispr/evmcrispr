import { keccak256, toHex } from "viem";

import { defineHelper } from "../../../utils";
import type { Std } from "../Std";

export const id = defineHelper<Std>({
  args: [{ name: "text", type: "string" }],
  async run(_, { text }) {
    return keccak256(toHex(text));
  },
});
