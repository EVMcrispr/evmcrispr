import {
  chainLabel,
  clientFor,
  defineHelper,
  ErrorException,
  resolveChainId,
} from "@evmcrispr/sdk";
import { callReadOperand } from "@evmcrispr/sdk/onchain";
import type { AbiFunction } from "viem";
import type Eez from "..";
import { eezBaseAbi } from "../abis";
import { eezConfig, eezConfigFor } from "../utils/eez";

const authorizedProxiesFn = eezBaseAbi.find(
  (f) => f.type === "function" && f.name === "authorizedProxies",
) as AbiFunction;

export default defineHelper<Eez>({
  name: "target",
  batchable: false,
  description:
    "The remote contract a cross-chain proxy stands in for: the reverse of @eez:proxy. Fails if the address is not a registered proxy on that chain.",
  compileDescription:
    "Reads the registry of the chain the assertion runs on only, and an address that is not a proxy resolves to the zero address instead of failing.",
  returnType: "address",
  args: [
    {
      name: "chain",
      type: "chain",
      description: "Chain the proxy lives on (`eezL1`, `eezL2`)",
    },
    {
      name: "proxy",
      type: "address",
      description: "Cross-chain proxy address on that chain",
    },
  ],
  async run(module, { chain, proxy }) {
    const chainId = resolveChainId(chain);
    const config = await eezConfigFor(module, chainId);
    const client = await clientFor(module, chainId);
    const [exists, originalAddress] = await client.readContract({
      address: config.registry,
      abi: eezBaseAbi,
      functionName: "authorizedProxies",
      args: [proxy],
    });
    if (!exists) {
      throw new ErrorException(
        `${proxy} is not a cross-chain proxy on ${chainLabel(chainId)}`,
      );
    }
    return originalAddress;
  },
  // `authorizedProxies(proxy)` is (exists, originalAddress, rollupId):
  // the address is word 1. An assertion runs on one chain, so only that
  // chain's registry can be read.
  compile: async (ctx, node) => {
    const [chainNode, proxyNode] = node.args;
    if (!chainNode || !proxyNode) {
      throw new ErrorException(
        "@eez:target! expects a chain and a proxy, e.g. @eez:target!(eezL1 $proxy)",
      );
    }
    const module = ctx.module as Eez;
    const chainId = resolveChainId(
      await ctx.interpreters.interpretNode(chainNode),
    );
    const current = await module.getChainId();
    if (chainId !== current) {
      throw new ErrorException(
        `@eez:target! reads the registry of the chain the assertion runs on (${chainLabel(current)}), not ${chainLabel(chainId)}`,
      );
    }
    const config = await eezConfig(module);
    return callReadOperand(
      ctx,
      config.registry,
      authorizedProxiesFn,
      [proxyNode],
      "Address",
      1n,
    );
  },
});
