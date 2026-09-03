import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import type Eez from "..";
import { eezBaseAbi } from "../abis";
import { computeProxy, eezConfig, resolveRollup } from "../utils/eez";

const computeProxyFn = eezBaseAbi.find(
  (f) => f.type === "function" && f.name === "computeCrossChainProxyAddress",
) as AbiFunction;

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
  // The registry's own `computeCrossChainProxyAddress`, read on-chain: the
  // chain resolves to a rollup id at build time, the target may be live.
  compile: async (ctx, node) => {
    const [chainNode, targetNode] = node.args;
    if (!chainNode || !targetNode) {
      throw new ErrorException(
        "@eez:proxy! expects a chain and a target, e.g. @eez:proxy!(eezL2 $target)",
      );
    }
    const module = ctx.module as Eez;
    const config = await eezConfig(module);
    const rollupId = resolveRollup(
      config,
      await ctx.interpreters.interpretNode(chainNode),
    );
    return callReadOperand(
      ctx,
      config.registry,
      computeProxyFn,
      [targetNode, { value: rollupId }],
      "Address",
    );
  },
});
