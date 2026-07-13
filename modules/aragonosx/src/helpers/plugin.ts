import { defineHelper } from "@evmcrispr/sdk";
import type AragonOSx from "..";

export default defineHelper<AragonOSx>({
  name: "plugin",
  description:
    "Resolve a plugin identifier to its address within the connected DAO.",
  returnType: "address",
  args: [
    {
      name: "pluginIdentifier",
      type: "string",
      description:
        "Plugin identifier (e.g. `token-voting`, `multisig:1`), or `_dao:plugin` for cross-DAO lookup",
    },
  ],
  async run(module, { pluginIdentifier }) {
    const { plugin } = module.resolvePlugin(pluginIdentifier, "@plugin()");
    return plugin.address;
  },
});
