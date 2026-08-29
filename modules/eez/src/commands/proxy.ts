import { chainLabel, defineCommand } from "@evmcrispr/sdk";
import type Eez from "..";
import { eezConfig, ensureProxy, remoteLabel } from "../utils/eez";

export default defineCommand<Eez>({
  name: "proxy",
  description:
    "Create the cross-chain proxy on the current chain for a contract on another EEZ rollup. Does nothing if it already exists.",
  args: [
    {
      name: "target",
      type: "address",
      description: "Contract address on the other rollup",
    },
  ],
  opts: [
    {
      name: "chain",
      type: ["string", "number"],
      description:
        "Chain the target lives on (`--chain eezL2`), or a bare rollup id. Defaults to the other side of the current chain.",
    },
  ],
  async run(module, { target }, { opts }) {
    const config = await eezConfig(module);
    const { proxy, rollupId, actions } = await ensureProxy(
      module,
      config,
      target,
      opts.chain,
    );
    const where = `${remoteLabel(config, rollupId)} contract ${target}`;
    if (actions.length === 0) {
      module.context.log(
        `Cross-chain proxy for ${where} already exists at ${proxy} on ${chainLabel(config.chainId)}`,
      );
      return [];
    }
    module.context.log(
      `Creating cross-chain proxy ${proxy} for ${where} on ${chainLabel(config.chainId)}`,
    );
    return actions;
  },
});
