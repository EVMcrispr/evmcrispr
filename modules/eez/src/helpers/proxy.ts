import { defineHelper } from "@evmcrispr/sdk";
import type Eez from "..";
import { computeProxy, eezConfig, resolveRollup } from "../utils/eez";

export default defineHelper<Eez>({
  name: "proxy",
  description:
    "Address on the current chain of the cross-chain proxy standing in for a contract on another EEZ chain. Deterministic, so it resolves whether or not the proxy has been created yet.",
  returnType: "address",
  args: [
    {
      name: "chain",
      type: "chain",
      description: "Chain the target lives on (`eezL1`, `eezL2`)",
    },
    {
      name: "target",
      type: "address",
      description: "Contract address on that chain",
    },
  ],
  async run(module, { chain, target }) {
    const config = await eezConfig(module);
    const rollupId = resolveRollup(config, chain);
    return computeProxy(module, config, target, rollupId);
  },
});
