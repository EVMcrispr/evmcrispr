import { defineHelper } from "@evmcrispr/sdk";
import type Eez from "..";
import { computeProxy, eezConfig, resolveRollup } from "../utils/eez";

export default defineHelper<Eez>({
  name: "proxy",
  description:
    "Address on the current chain of the cross-chain proxy standing in for a contract on another EEZ rollup. Deterministic, so it resolves whether or not the proxy has been created yet.",
  returnType: "address",
  args: [
    {
      name: "target",
      type: "address",
      description: "Contract address on the other rollup",
    },
    {
      name: "rollup",
      type: "number",
      namedOnly: true,
      description:
        "Rollup id the target lives on (`rollup:1`). Defaults to the other side of the current chain: the rollup from L1, L1 from the rollup.",
    },
  ],
  async run(module, { target, rollup }) {
    const config = await eezConfig(module);
    const rollupId = resolveRollup(config, rollup);
    return computeProxy(module, config, target, rollupId);
  },
});
