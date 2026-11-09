import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type { Operand } from "@evmcrispr/sdk/onchain";
import {
  encodeCond,
  rawParam,
  staticCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import { encodeFunctionData, labelhash, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { nameWrapperMap } from "../addresses";
import { v2Name } from "../ethRegistry";
import {
  onchainAddress,
  onchainRegistry,
  v2OrV1Read,
  v2ReadAbi,
} from "../onchain";
import {
  ensClient,
  getNode,
  getRegistryOwner,
  getWrappedData,
  isWrapped,
  nameWrapperAbi,
  registryAbi,
} from "../utils";

export default defineHelper<Ens>({
  name: "owner",
  batchable: false,
  description:
    "Owner of an ENS name (the real owner when the name is wrapped).",
  compileDescription:
    "Mainnet only, since an assertion reads the chain it runs on, and an unowned name reads as the zero address rather than an error.",
  returnType: "address",
  args: [
    {
      name: "name",
      type: "string",
      description: "ENS name (e.g. vitalik.eth)",
    },
  ],
  async run(module, { name }, { node }) {
    const client = await ensClient(module);
    const v2 = await v2Name(client, mainnet.id, name);
    if (v2) return v2.owner;
    const ensNode = getNode(name);
    if (await isWrapped(client, mainnet.id, ensNode)) {
      const { owner } = await getWrappedData(client, mainnet.id, ensNode);
      return owner;
    }
    const owner = await getRegistryOwner(client, mainnet.id, ensNode);
    if (owner === zeroAddress) {
      throw new HelperFunctionError(node, `no owner found for ${name}`);
    }
    return owner;
  },
  compile: async (ctx, node): Promise<Operand> => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const ensNode = getNode(name);
    const registry = await onchainRegistry(ctx);
    const wrapper = await onchainAddress(ctx, nameWrapperMap, "NameWrapper");

    const registryOwner = staticCallParam(
      registry,
      encodeFunctionData({
        abi: registryAbi,
        functionName: "owner",
        args: [ensNode],
      }),
    );
    // A wrapped name is owned by the NameWrapper in the registry, and the
    // real owner is the ERC-1155 holder — the same unwrapping the plain
    // face does with isWrapped, expressed as a cond so it follows a name
    // that gets wrapped or unwrapped between building and executing.
    const wrappedOwner = staticCallParam(
      wrapper,
      encodeFunctionData({
        abi: nameWrapperAbi,
        functionName: "ownerOf",
        args: [BigInt(ensNode)],
      }),
    );
    const v1 = staticCallParam(
      ctx.core,
      encodeCond(
        wordOpParam(
          ctx,
          "eq",
          false,
          registryOwner,
          rawParam(toWord(BigInt(wrapper))),
        ),
        wrappedOwner,
        registryOwner,
      ),
    );
    // An ENSv2 name's owner is its registry's (zero once expired).
    return v2OrV1Read(
      ctx,
      name,
      (label) =>
        encodeFunctionData({
          abi: v2ReadAbi,
          functionName: "getOwner",
          args: [BigInt(labelhash(label))],
        }),
      v1,
      "Address",
    );
  },
});
