import { defineCommand, encodeAction } from "@evmcrispr/sdk";
import type Safe from "..";
import { findListPredecessor, getModules } from "../utils";

export default defineCommand<Safe>({
  smartSupport: {
    kind: "static",
    reason:
      "The module address selects its predecessor in the Safe linked list at build time.",
  },
  name: "disable-module",
  description: "Disable a module on the Safe.",
  args: [
    {
      name: "module",
      type: "address",
      description: "Module address to disable",
    },
  ],
  async run(module, { module: moduleAddress }) {
    const safe = await module.resolveSafe();

    const modules = await getModules(await module.getClient(), safe);
    const prevModule = findListPredecessor(modules, moduleAddress, "module");

    return [
      encodeAction(safe, "disableModule(address,address)", [
        prevModule,
        moduleAddress,
      ]),
    ];
  },
});
