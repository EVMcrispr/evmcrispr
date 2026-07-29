import type { TransactionAction } from "@evmcrispr/core";
import { lookupFunctionSignature } from "@evmcrispr/sdk";
import { type AbiFunction, decodeFunctionData, parseAbiItem } from "viem";

export interface DecodedArg {
  type: string;
  value: string;
}

export interface DecodedAction {
  to?: string;
  value: bigint;
  chainId?: number;
  /** Human-readable signature, e.g. `deposit()` — present when the
   *  selector could be resolved and the calldata decoded. */
  signature?: string;
  functionName?: string;
  args?: DecodedArg[];
  /** Raw calldata, kept for the hex fallback view. */
  data?: `0x${string}`;
  isDeployment: boolean;
}

function stringifyArg(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return `[${value.map(stringifyArg).join(", ")}]`;
  if (typeof value === "object" && value !== null)
    return JSON.stringify(value, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  return String(value);
}

/**
 * Best-effort decode of a transaction action for display purposes: the
 * 4-byte selector is resolved against the openchain.xyz signature
 * database and the calldata decoded with viem. Anything that fails to
 * resolve falls back to the raw calldata hex.
 */
export async function decodeAction(
  action: TransactionAction,
): Promise<DecodedAction> {
  const base: DecodedAction = {
    to: action.to,
    value: action.value ?? 0n,
    chainId: action.chainId,
    data: action.data,
    isDeployment: action.to === undefined,
  };

  const data = action.data;
  if (base.isDeployment || !data || data.length < 10) return base;

  const selector = data.slice(0, 10);
  const signature = await lookupFunctionSignature(selector);
  if (!signature) return base;

  try {
    const abiItem = parseAbiItem(`function ${signature}`) as AbiFunction;
    const { functionName, args } = decodeFunctionData({
      abi: [abiItem],
      data,
    });
    return {
      ...base,
      signature,
      functionName,
      args: (args ?? []).map((value, i) => ({
        type: abiItem.inputs[i]?.type ?? "unknown",
        value: stringifyArg(value),
      })),
    };
  } catch {
    // Signature lookup can return a colliding selector whose types don't
    // match this calldata — show the hex rather than a wrong decoding.
    return base;
  }
}
