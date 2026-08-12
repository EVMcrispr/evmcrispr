import {
  defineHelper,
  ErrorException,
  HelperFunctionError,
  NodeType,
} from "@evmcrispr/sdk";
import { isBangHelperNode } from "@evmcrispr/sdk/onchain";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";
import { namehash } from "viem/ens";
import type Ens from "..";
import { EMPTY_DYNAMIC_RETURN, resolverGatedChain } from "../onchain";

const nameAbi = parseAbi(["function name(bytes32 node) view returns (string)"]);

export default defineHelper<Ens>({
  name: "name",
  batchable: false,
  description: "Reverse-resolve an address to its primary ENS name.",
  compileDescription:
    "Mainnet only; reads the reverse record of a constant address without the forward check, and an address with no record reads as an empty string.",
  returnType: "string",
  args: [
    { name: "address", type: "address", description: "Address to resolve" },
  ],
  async run(module, { address }, { node }) {
    const client = createPublicClient({
      chain: mainnet,
      transport: module.getTransport(mainnet.id),
    });
    const name = await client.getEnsName({ address });
    if (!name) {
      throw new HelperFunctionError(
        node,
        `no primary ENS name found for ${address}`,
      );
    }
    return name;
  },
  // The reverse node is a namehash over the address's hex label, which
  // only exists at composition time — there is no on-chain path from a
  // live address word to its reverse record. The plain face's forward
  // check (name must resolve back to the address) is skipped: it would
  // triple the tree, and the divergence is declared instead.
  compile: async (ctx, node) => {
    const argNode = node.args[0];
    if (argNode.type === NodeType.CallExpression || isBangHelperNode(argNode)) {
      throw new ErrorException(
        "@name! reverse-resolves a constant address — a live address has no on-chain reverse node",
      );
    }
    const address = getAddress(
      String(await ctx.interpreters.interpretNode(argNode)),
    );
    const reverseNode = namehash(
      `${address.toLowerCase().slice(2)}.addr.reverse`,
    );
    return resolverGatedChain(
      ctx,
      reverseNode,
      encodeFunctionData({
        abi: nameAbi,
        functionName: "name",
        args: [reverseNode],
      }),
      EMPTY_DYNAMIC_RETURN,
      "String",
    );
  },
});
