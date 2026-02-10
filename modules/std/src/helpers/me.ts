import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "me",
  args: [],
  async run(module) {
    return module.getConnectedAccount(true);
  },
});
