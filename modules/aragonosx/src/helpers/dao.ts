import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";

export default defineHelper<AragonOSx>({
  name: "dao",
  description: "Resolve the connected DAO (or a named one) to its address.",
  returnType: "address",
  args: [
    {
      name: "daoIdentifier",
      type: "string",
      description: "Subdomain or address of a connected DAO",
      optional: true,
    },
  ],
  async run(module, { daoIdentifier }) {
    const dao = daoIdentifier
      ? module.findDAO(daoIdentifier)
      : module.currentDAO;

    if (!dao) {
      throw new ErrorException(
        daoIdentifier
          ? `DAO "${daoIdentifier}" is not connected`
          : '@dao() must be used within a "connect" command',
      );
    }

    return dao.address;
  },
});
