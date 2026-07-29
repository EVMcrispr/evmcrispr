import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type AccessControl from "..";

export default defineCommand<AccessControl>({
  name: "set-target-closed",
  description:
    "Close or reopen a contract managed by an AccessManager. While closed, all calls to its restricted functions revert.",
  args: [
    { name: "manager", type: "address", description: "AccessManager address" },
    {
      name: "target",
      type: "address",
      description: "Managed contract address",
    },
    {
      name: "closed",
      type: "bool",
      description: "true to close, false to reopen",
    },
  ],
  async run(_module, { manager, target, closed }) {
    return [
      encodeAction(manager, "setTargetClosed(address,bool)", [target, closed]),
    ];
  },
});
