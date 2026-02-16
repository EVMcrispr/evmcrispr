import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "me",
  returnType: "address",
  args: [],
  async run(module) {
    return module.getConnectedAccount(true);
  },
});
