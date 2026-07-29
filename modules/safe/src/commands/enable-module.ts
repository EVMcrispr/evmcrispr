import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";

export default defineCommand<Safe>({
  name: "enable-module",
  description:
    "Enable a module on the Safe, allowing it to execute transactions without owner signatures (e.g. a Zodiac module).",
  args: [
    {
      name: "module",
      type: "address",
      description: "Module address to enable",
    },
  ],
  async run(module, { module: moduleAddress }) {
    const safe = await module.resolveSafe();

    return [encodeAction(safe, "enableModule(address)", [moduleAddress])];
  },
});
