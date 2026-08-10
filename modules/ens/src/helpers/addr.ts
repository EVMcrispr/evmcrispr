import {
  defineHelper,
  ErrorException,
  HelperFunctionError,
} from "@evmcrispr/sdk";
import {
  coreCall,
  encodeChain,
  encodeCond,
  rawParam,
  staticCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, parseAbi } from "viem";
import { normalize } from "viem/ens";

const resolverAddrAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
]);

import type Ens from "..";
import { registryMap, requireAddress } from "../addresses";
import { getNode, mainnetClient, registryAbi } from "../utils";

export default defineHelper<Ens>({
  name: "addr",
  batchable: false,
  description: "Resolve an ENS name to an address, optionally per coin type.",
  compileDescription:
    "Mainnet only, and a name with no resolver set reads as the zero address instead of reverting.",
  returnType: "address",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
    {
      name: "coinType",
      type: "number",
      optional: true,
      description: "ENSIP-9/11 coin type (defaults to 60, ETH)",
    },
  ],
  async run(module, { name, coinType }, { node }) {
    const client = mainnetClient(module);
    const address = await client.getEnsAddress({
      name: normalize(name),
      ...(coinType !== undefined ? { coinType: BigInt(String(coinType)) } : {}),
    });
    if (!address) {
      throw new HelperFunctionError(node, `no address found for ${name}`);
    }
    return address;
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@addr! resolves the default (ETH) address on-chain; coin-typed resolution stays off-chain",
      );
    }
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const ensNode = getNode(name);
    // ENS lives on mainnet/sepolia; other chains keep the mainnet
    // registry literal, mirroring the run face's mainnet resolution.
    const chainId = await ctx.module.getChainId();
    const registry =
      registryMap.get(chainId) ?? requireAddress(registryMap, 1, "ENS");
    const resolverParam = staticCallParam(
      registry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "resolver",
        args: [ensNode],
      }),
    );
    // cond(eq(resolver, 0), 0, chain(resolver, addr(node))): an unset
    // resolver resolves to the zero word instead of reverting.
    const addrChain = staticCallParam(
      ctx.core,
      encodeChain(resolverParam, [
        encodeFunctionData({
          abi: resolverAddrAbi,
          functionName: "addr",
          args: [ensNode],
        }),
      ]),
    );
    return coreCall(
      ctx,
      encodeCond(
        wordOpParam(ctx, "eq", false, resolverParam, rawParam(toWord(0n))),
        rawParam(toWord(0n)),
        addrChain,
      ),
      "Address",
    );
  },
});
