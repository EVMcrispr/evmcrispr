import {
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  fieldItem,
  getFunctionFragment,
  interpretNodeSync,
  isFunctionSignature,
  parseSignatureParamTypes,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { isAddress } from "viem";
import type AragonOS from "..";
import { getDAOAppIdentifiers } from "../utils";
import { batchForwarderActions } from "../utils/forwarders";

const { ABI } = BindingsSpace;

export default defineCommand<AragonOS>({
  name: "act",
  args: [
    { name: "agent", type: "address" },
    { name: "target", type: "address" },
    { name: "signature", type: "string" },
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
    signature: (ctx) => {
      const targetAddress = interpretNodeSync(ctx.nodeArgs[1], ctx.bindings);

      if (!targetAddress || !isAddress(targetAddress)) {
        return [];
      }

      let abi = ctx.bindings.getBindingValue(targetAddress, ABI);
      if (!abi) {
        abi = ctx.cache.getBindingValue(targetAddress, ABI);
      }

      if (!abi) {
        return [];
      }
      const functions = abi
        .filter(
          (item): item is AbiFunction =>
            item.type === "function" &&
            (item.stateMutability === "nonpayable" ||
              item.stateMutability === "payable"),
        )
        .map((func: AbiFunction) =>
          getFunctionFragment(func)
            .replace("function ", "")
            .replace(/ returns \(.*\)/, ""),
        );
      return functions.map(fieldItem);
    },
  },
  async run(
    module,
    { agent: agentAddress, target: targetAddress, signature, params },
  ) {
    if (!isFunctionSignature(signature)) {
      throw new ErrorException(
        `<signature> must be a valid function signature, got ${signature}`,
      );
    }

    const execAction = encodeAction(targetAddress, signature, params);

    return batchForwarderActions(module, [execAction], [agentAddress]);
  },
});
