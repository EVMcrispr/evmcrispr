import { ErrorException, type TransactionAction } from "@evmcrispr/sdk";
import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
} from "viem";

export { DELEGATOR_BYTECODE } from "./delegator-bytecode";

/**
 * MetaMask EIP7702StatelessDeleGator v1.3.0 — the contract MetaMask installs
 * on EOAs for EIP-5792 `wallet_sendCalls` batching. Deployed at the same
 * address across MetaMask-supported chains.
 */
export const DELEGATOR_ADDRESS: Address =
  "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";

/** EIP-7702 delegation designator (`0xef0100 ++ delegate`) for an address. */
export function delegationDesignator(delegate: Address): `0x${string}` {
  return `0xef0100${delegate.slice(2)}` as `0x${string}`;
}

/**
 * Parse an EIP-7702 delegation designator, returning the delegate address or
 * null if the code is not a designator.
 */
export function parseDelegation(
  code: `0x${string}` | undefined,
): Address | null {
  if (!code) return null;
  const hex = code.toLowerCase();
  if (hex.length !== 2 + 23 * 2) return null;
  if (!hex.startsWith("0xef0100")) return null;
  try {
    return getAddress(`0x${hex.slice(8)}`) as Address;
  } catch {
    return null;
  }
}

/** ERC-7821 mode: batch calltype (0x01), default exectype, no opData. */
const BATCH_MODE =
  "0x0100000000000000000000000000000000000000000000000000000000000000" as const;

const EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionCalldata", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

/**
 * Encode an ERC-7821 `execute(bytes32,bytes)` call executing the given
 * transactions as a batch (ERC-7579 `ExecutionLib.encodeBatch` layout).
 */
export function encodeBatchExecute(
  actions: TransactionAction[],
): `0x${string}` {
  if (actions.some((action) => !action.to)) {
    throw new ErrorException(
      "can't include contract deployments in a batched simulation",
    );
  }

  const executionCalldata = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    [
      actions.map((action) => ({
        target: action.to as Address,
        value: action.value ?? 0n,
        callData: action.data ?? "0x",
      })),
    ],
  );

  return encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: "execute",
    args: [BATCH_MODE, executionCalldata],
  });
}
