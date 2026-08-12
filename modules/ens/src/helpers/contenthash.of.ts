import { decode, getCodec } from "@ensdomains/content-hash";
import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { encodeFunctionData, parseAbi } from "viem";
import { normalize } from "viem/ens";
import type Ens from "..";
import { EMPTY_DYNAMIC_RETURN, resolverGatedChain } from "../onchain";
import { getNode, mainnetClient } from "../utils";

const contenthashAbi = parseAbi([
  "function contenthash(bytes32 node) view returns (bytes)",
]);

export default defineHelper<Ens>({
  name: "contenthash.of",
  batchable: false,
  description: "Read the decoded content hash of an ENS name (e.g. ipfs://…).",
  compileDescription:
    "Mainnet only; reads the raw content hash bytes (compare against @ens:contenthash) rather than the decoded URI, and a missing record reads as empty bytes.",
  returnType: "string",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const client = mainnetClient(module);
    const resolver = await client.getEnsResolver({ name: normalize(name) });
    if (!resolver) {
      throw new HelperFunctionError(node, `no resolver found for ${name}`);
    }
    const contenthash = await client.readContract({
      address: resolver,
      abi: contenthashAbi,
      functionName: "contenthash",
      args: [getNode(name)],
    });
    if (!contenthash || contenthash === "0x") {
      throw new HelperFunctionError(node, `no content hash found for ${name}`);
    }
    const encoded = contenthash.slice(2);
    return `${getCodec(encoded)}://${decode(encoded)}`;
  },
  // The face reads the raw multicodec bytes the resolver holds; the
  // decoded `codec://hash` form is an off-chain rendering. The plain
  // @ens:contenthash encoder produces the same raw bytes from a URI, so
  // the two compose: assert @ens:contenthash.of!(x) == @ens:contenthash(u).
  compile: async (ctx, node) => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const ensNode = getNode(name);
    return resolverGatedChain(
      ctx,
      ensNode,
      encodeFunctionData({
        abi: contenthashAbi,
        functionName: "contenthash",
        args: [ensNode],
      }),
      EMPTY_DYNAMIC_RETURN,
      "Bytes",
    );
  },
});
