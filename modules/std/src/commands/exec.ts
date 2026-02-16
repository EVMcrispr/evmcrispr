import type { Abi, Address, HelperFunctionNode } from "@evmcrispr/sdk";
import {
  addressesEqual,
  BindingsSpace,
  defineCommand,
  ErrorException,
  encodeAction,
  fetchAbi,
  fieldItem,
  getFunctionFragment,
  interpretNodeSync,
  isFunctionSignature,
  parseSignatureParamTypes,
  resolveEventCaptures,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { erc20Abi, getAbiItem, isAddress } from "viem";
import type Std from "..";

const { ABI } = BindingsSpace;

export default defineCommand<Std>({
  name: "exec",
  args: [
    { name: "contractAddress", type: "address" },
    { name: "signature", type: "literal" },
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
      // Check if it's a @token helper and provide ERC-20 functions
      const abi =
        targetNode?.type === "HelperFunctionExpression" &&
        (targetNode as HelperFunctionNode).name === "token"
          ? erc20Abi
          : (() => {
              const targetAddress = interpretNodeSync(targetNode, ctx.bindings);
              if (!targetAddress || !isAddress(targetAddress)) return [];

              // Try bindings first, then cache
              let abi = ctx.bindings.getBindingValue(targetAddress, ABI);
              if (!abi) {
                abi = ctx.cache.getBindingValue(targetAddress, ABI);
              }
              if (!abi) return [];
              return abi;
            })();

      const functions = (abi as any[])
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
    { contractAddress, signature, params },
    { opts, node, interpreters },
  ) {
    const { interpretNode, actionCallback } = interpreters;

    let finalSignature = signature;
    let targetAddress: Address = contractAddress;

    if (!isFunctionSignature(signature)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(signature)) {
        throw new ErrorException(`invalid signature "${signature}"`);
      }
      const abi = module.bindingsManager.getBindingValue(
        contractAddress,
        ABI,
      ) as Abi | undefined;

      if (abi) {
        const func = getAbiItem({
          abi,
          name: signature,
        });

        finalSignature = getFunctionFragment(func);
      } else {
        let fetchedAbi: Abi;
        try {
          [targetAddress, fetchedAbi] = await fetchAbi(
            contractAddress,
            await module.getClient(),
          );
        } catch (err) {
          const err_ = err as Error;
          throw new ErrorException(
            `an error ocurred while fetching ABI for ${contractAddress} - ${err_.message}`,
          );
        }

        if (!fetchedAbi) {
          throw new ErrorException(
            `ABI not found for signature "${signature}"`,
          );
        }

        try {
          finalSignature = getFunctionFragment(
            getAbiItem({
              abi: fetchedAbi,
              name: signature,
            }),
          );
        } catch (err) {
          const err_ = err as Error;
          throw new ErrorException(
            `error when getting function from ABI - ${err_.message}`,
          );
        }

        module.bindingsManager.setBinding(contractAddress, fetchedAbi, ABI);
        if (!addressesEqual(targetAddress, contractAddress)) {
          module.bindingsManager.setBinding(targetAddress, fetchedAbi, ABI);
        }
      }
    }

    const execAction = encodeAction(targetAddress, finalSignature, params);

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

      const contractAbi = module.bindingsManager.getBindingValue(
        contractAddress,
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
