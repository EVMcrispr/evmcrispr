import type { TransactionAction } from "@evmcrispr/sdk";
import type { Abi, Address } from "viem";
import { encodeFunctionData } from "viem";

/**
 * Build a transaction action from a parsed ABI. Unlike the SDK's
 * `encodeAction`, this supports tuple parameters (Action[] structs, PSP
 * params), which OSx calls are full of.
 */
export function abiAction(
  to: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
  value?: bigint,
): TransactionAction {
  return {
    to,
    data: encodeFunctionData({ abi, functionName, args }),
    ...(value !== undefined ? { value } : {}),
  };
}
