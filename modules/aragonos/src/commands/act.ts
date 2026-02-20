import {
  abiBindingKey,
  BindingsSpace,
  defineCommand,
  encodeAction,
  fetchAbi,
  fieldItem,
  interpretNodeSync,
  parseSignatureParamTypes,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { isAddress, toFunctionSignature } from "viem";
import type AragonOS from "..";
import { getDAOAppIdentifiers } from "../utils";
import { batchForwarderActions } from "../utils/forwarders";

const { ABI } = BindingsSpace;

export default defineCommand<AragonOS>({
  name: "act",
  args: [
    { name: "agent", type: "address" },
    { name: "target", type: "address" },
    { name: "signature", type: "signature" },
    {
      name: "params",
      type: "any",
      rest: true,
      resolveType: (ctx) => {
        const sigNode = ctx.nodeArgs[2];
        if (!sigNode?.value) return "any";
        const paramTypes = parseSignatureParamTypes(sigNode.value);
        const paramIndex = ctx.argIndex - 3;
        return paramTypes[paramIndex] ?? "any";
      },
    },
  ],
  completions: {
    agent: (ctx) =>
      getDAOAppIdentifiers(ctx.bindings)
        .filter((id) => id.includes("agent"))
        .map(fieldItem),
    signature: async (ctx) => {
      const targetAddress = interpretNodeSync(ctx.nodeArgs[1], ctx.bindings);

      if (!targetAddress || !isAddress(targetAddress)) {
        return [];
      }

      const key = abiBindingKey(ctx.chainId, targetAddress);
      let abi = ctx.bindings.getBindingValue(key, ABI);
      if (!abi) {
        abi = ctx.cache.getBindingValue(key, ABI);
      }
      if (!abi) {
        try {
          const [, fetchedAbi, fetchedChainId] = await fetchAbi(
            targetAddress,
            ctx.client,
          );
          const fetchedKey = abiBindingKey(fetchedChainId, targetAddress);
          ctx.cache.setBinding(
            fetchedKey,
            fetchedAbi,
            ABI,
            false,
            undefined,
            true,
          );
          abi = fetchedAbi;
        } catch {
          return [];
        }
      }

      const functions = abi
        .filter(
          (item): item is AbiFunction =>
            item.type === "function" &&
            (item.stateMutability === "nonpayable" ||
              item.stateMutability === "payable"),
        )
        .map((func: AbiFunction) => toFunctionSignature(func));
      return functions.map(fieldItem);
    },
  },
  async run(module, { agent, target, signature, params }) {
    const execAction = encodeAction(target, signature, params);
    return batchForwarderActions(module, [execAction], [agent]);
  },
});
