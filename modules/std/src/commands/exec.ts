import type { Abi, Address } from "@evmcrispr/sdk";
import {
  abiBindingKey,
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  fetchAbi,
  fieldItem,
  interpretNodeSync,
  isFunctionSignature,
  parseSignatureParamTypes,
  resolveEventCaptures,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import {
  getAbiItem,
  isAddress,
  isAddressEqual,
  toFunctionSignature,
} from "viem";
import type Std from "..";

const { ABI } = BindingsSpace;

export default defineCommand<Std>({
  name: "exec",
  description:
    "Call a contract function, encoding the arguments from its signature.",
  args: [
    { name: "contractAddress", type: "address" },
    { name: "signature", type: "signature" },
    {
      name: "params",
      type: "any",
      rest: true,
      resolveType: (ctx) => {
        const sigNode = ctx.nodeArgs[1];
        if (!sigNode?.value) return "any";
        const paramTypes = parseSignatureParamTypes(sigNode.value);
        const paramIndex = ctx.argIndex - 2;
        return paramTypes[paramIndex] ?? "any";
      },
    },
  ],
  opts: [
    { name: "value", type: "number" },
    { name: "from", type: "address" },
    { name: "gas", type: "number" },
    { name: "max-fee-per-gas", type: "number" },
    { name: "max-priority-fee-per-gas", type: "number" },
    { name: "nonce", type: "number" },
  ],
  completions: {
    signature: async (ctx) => {
      const targetNode = ctx.nodeArgs[0];
      const targetAddress = interpretNodeSync(targetNode, ctx.bindings);
      if (!targetAddress || !isAddress(targetAddress)) return [];

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
  async run(
    module,
    { contractAddress, signature, params },
    { opts, node, interpreters },
  ) {
    const { interpretNode, actionCallback } = interpreters;

    const execAction = encodeAction(contractAddress, signature, params);

    if (opts.value !== undefined) {
      execAction.value = BigInt(opts.value);
    }

    if (opts.from) {
      execAction.from = opts.from;
    }

    if (opts.gas !== undefined) {
      execAction.gas = BigInt(opts.gas);
    }

    if (opts["max-fee-per-gas"] !== undefined) {
      execAction.maxFeePerGas = BigInt(opts["max-fee-per-gas"]);
    }

    if (opts["max-priority-fee-per-gas"] !== undefined) {
      execAction.maxPriorityFeePerGas = BigInt(
        opts["max-priority-fee-per-gas"],
      );
    }

    if (opts.nonce !== undefined) {
      execAction.nonce = Number(opts.nonce);
    }

    // Handle event captures: dispatch action, decode receipt logs, store variables
    if (node.eventCaptures && node.eventCaptures.length > 0) {
      if (!actionCallback) {
        throw new ErrorException(
          "event capture requires an execution context with transaction access",
        );
      }

      const receipt = await actionCallback(execAction);

      const eventChainId = await module.getChainId();
      const contractAbi = module.bindingsManager.getBindingValue(
        abiBindingKey(eventChainId, contractAddress),
        ABI,
      ) as Abi | undefined;

      await resolveEventCaptures(
        receipt as { logs: any[] },
        contractAbi,
        node.eventCaptures,
        module.bindingsManager,
        interpretNode,
      );

      return [];
    }

    return [execAction];
  },
});
