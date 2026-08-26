import { defineHelper } from "@evmcrispr/sdk";
import type Gelato from "..";
import { AUTOMATE_ADDRESS } from "../addresses";
import { requireAutomate } from "../utils/protocol";

export default defineHelper<Gelato>({
  name: "automate",
  batchable: false,
  description:
    "Address of the Gelato Automate task registry on the current chain, for direct calls.",
  returnType: "address",
  args: [],
  async run(module) {
    await requireAutomate(module);
    return AUTOMATE_ADDRESS;
  },
});
