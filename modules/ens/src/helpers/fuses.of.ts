import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import { directReadOperand } from "@evmcrispr/sdk/onchain";
import { encodeFunctionData } from "viem";
import { mainnet } from "viem/chains";
import type Ens from "..";
import { nameWrapperMap } from "../addresses";
import { decodeFuses } from "../fuses";
import { onchainAddress } from "../onchain";
import {
  getNode,
  getWrappedData,
  isWrapped,
  mainnetClient,
  nameWrapperAbi,
} from "../utils";

export default defineHelper<Ens>({
  name: "fuses.of",
  experimental: true,
  batchable: false,
  description: "Burned fuse names of a wrapped ENS name.",
  compileDescription:
    "Mainnet only; reads the raw fuse bitmap (compare against @ens:fuses) rather than decoded names, and an unwrapped name reads as 0 instead of erroring.",
  returnType: "array",
  args: [{ name: "name", type: "string", description: "Wrapped ENS name" }],
  async run(module, { name }, { node }) {
    const client = mainnetClient(module);
    const ensNode = getNode(name);
    if (!(await isWrapped(client, mainnet.id, ensNode))) {
      throw new HelperFunctionError(node, `${name} is not wrapped`);
    }
    const { fuses } = await getWrappedData(client, mainnet.id, ensNode);
    return decodeFuses(fuses);
  },
  // The face reads what the chain holds — the uint32 bitmap, word 1 of
  // NameWrapper.getData — where the plain face decodes it to names. The
  // plain @ens:fuses encoder turns names back into the bitmap, so the
  // two compose: assert @ens:fuses.of!(x) == @ens:fuses([...]).
  compile: async (ctx, node) => {
    const name = String(await ctx.interpreters.interpretNode(node.args[0]));
    const wrapper = await onchainAddress(ctx, nameWrapperMap, "NameWrapper");
    return directReadOperand(
      ctx,
      wrapper,
      encodeFunctionData({
        abi: nameWrapperAbi,
        functionName: "getData",
        args: [BigInt(getNode(name))],
      }),
      "Uint",
      1n,
    );
  },
});
