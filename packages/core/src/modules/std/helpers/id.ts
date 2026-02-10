import { keccak256, toHex } from "viem";

import { defineHelper } from "../../../utils";
import type { Std } from "..";

export default defineHelper<Std>({
  name: "id",
  args: [{ name: "text", type: "string" }],
  async run(_, { text }) {
    return keccak256(toHex(text));
  },
});
