import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import type AragonOSx from "..";

export default defineHelper<AragonOSx>({
  name: "plugin",
  description:
    "Resolve a plugin repo subdomain to its address within the connected DAO.",
  returnType: "address",
  args: [
    {
      name: "pluginName",
      type: "string",
      description: "Plugin repo subdomain (e.g. `token-voting`, `multisig`)",
    },
    {
      name: "index",
      type: "number",
      optional: true,
      description:
        "Instance index when multiple plugins share a subdomain (0 = first)",
    },
  ],
  async run(module, { pluginName, index: rawIndex }) {
    const index = rawIndex === undefined ? 0 : Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) {
      throw new ErrorException(
        `@plugin() index must be a non-negative integer, got ${rawIndex}`,
      );
    }

    const { plugin } = module.resolvePlugin(pluginName, "@plugin()", index);
    return plugin.address;
  },
});
