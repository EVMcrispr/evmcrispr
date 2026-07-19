import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";

export default defineHelper<AragonOSx>({
  name: "dao",
  description: "Resolve the connected DAO to its address.",
  returnType: "address",
  args: [],
  async run(module) {
    const dao = module.currentDAO;

    if (!dao) {
      throw new ErrorException(
        '@dao() must be used within a "connect" command',
      );
    }

    return dao.address;
  },
});
