import { defineHelper } from "@evmcrispr/sdk";
import type AragonOSx from "..";
import { permissionId } from "../utils/permissions";

export default defineHelper<AragonOSx>({
  name: "permission",
  description:
    "Compute the bytes32 id of a permission name (keccak256 of e.g. EXECUTE_PERMISSION).",
  returnType: "bytes32",
  args: [
    {
      name: "name",
      type: "string",
      description: "Permission name (e.g. `EXECUTE`) or bytes32 id",
    },
  ],
  async run(_, { name }) {
    return permissionId(name);
  },
});
