import type { Address, TransactionAction } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import { encodeFunctionData, hashTypedData, parseAbi, zeroAddress } from "viem";
import { CANONICAL_DEPLOYMENT, type SafeDeployment } from "../addresses";
import { encodeMultiSendCall } from "./multisend";

export interface SafeTx {
  to: Address;
  value: bigint;
  data: `0x${string}`;
  operation: 0 | 1;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Address;
  refundReceiver: Address;
  nonce: bigint;
}

export const assertAllTransactionActions = (
  actions: unknown[],
  commandName: string,
): TransactionAction[] => {
  const invalid = actions.filter(
    (a) => a && typeof a === "object" && "type" in (a as any),
  );
  if (invalid.length) {
    throw new ErrorException(
      `can't use non-transaction actions inside a ${commandName} command`,
    );
  }
  return actions as TransactionAction[];
};

/**
 * Collapse a list of inner actions into the (to, value, data, operation) of
 * a single Safe transaction. One action passes through untouched; several
 * are packed into a MultiSend call, delegatecalled by the Safe. The
 * call-only MultiSend is used unless an inner action itself requires a
 * delegatecall.
 */
export const buildSafeTxContent = (
  actions: TransactionAction[],
  deployment: SafeDeployment = CANONICAL_DEPLOYMENT,
): Pick<SafeTx, "to" | "value" | "data" | "operation"> => {
  if (actions.length === 1) {
    const [action] = actions;
    if (!action.to) {
      throw new ErrorException(
        "contract deployments (CREATE) are not supported inside a Safe transaction",
      );
    }
    return {
      to: action.to,
      value: action.value ?? 0n,
      data: action.data ?? "0x",
      operation: action.operation ?? 0,
    };
  }

  const hasDelegateCall = actions.some((a) => a.operation === 1);
  return {
    to: hasDelegateCall ? deployment.multiSend : deployment.multiSendCallOnly,
    value: 0n,
    data: encodeMultiSendCall(actions),
    operation: 1,
  };
};

export const buildSafeTx = (
  actions: TransactionAction[],
  nonce: bigint,
  deployment: SafeDeployment = CANONICAL_DEPLOYMENT,
): SafeTx => ({
  ...buildSafeTxContent(actions, deployment),
  safeTxGas: 0n,
  baseGas: 0n,
  gasPrice: 0n,
  gasToken: zeroAddress,
  refundReceiver: zeroAddress,
  nonce,
});

/** EIP-712 domain of a Safe >=1.3.0 (older versions omit chainId). */
export const SAFE_DOMAIN_TYPE = [
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

export const SAFE_TX_TYPE = [
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "data", type: "bytes" },
  { name: "operation", type: "uint8" },
  { name: "safeTxGas", type: "uint256" },
  { name: "baseGas", type: "uint256" },
  { name: "gasPrice", type: "uint256" },
  { name: "gasToken", type: "address" },
  { name: "refundReceiver", type: "address" },
  { name: "nonce", type: "uint256" },
] as const;

export const getSafeDomain = (chainId: number, safe: Address) =>
  ({ chainId: BigInt(chainId), verifyingContract: safe }) as const;

export const getSafeTxTypedData = (
  chainId: number,
  safe: Address,
  tx: SafeTx,
) =>
  ({
    domain: getSafeDomain(chainId, safe),
    types: {
      // Included explicitly because eth_signTypedData_v4 requires it in the
      // payload (viem's hashTypedData derives it from `domain` and allows
      // the redundant entry).
      EIP712Domain: SAFE_DOMAIN_TYPE,
      SafeTx: SAFE_TX_TYPE,
    },
    primaryType: "SafeTx" as const,
    message: { ...tx },
  }) as const;

export const hashSafeTx = (
  chainId: number,
  safe: Address,
  tx: SafeTx,
): `0x${string}` => hashTypedData(getSafeTxTypedData(chainId, safe, tx));

/** Pre-validated Safe signature (v = 1): valid when the encoded owner is the
 *  `msg.sender` of execTransaction (or has called approveHash). */
export const preValidatedSignature = (owner: Address): `0x${string}` =>
  `0x000000000000000000000000${owner.slice(2)}${"0".repeat(64)}01` as `0x${string}`;

const execTransactionAbi = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
]);

export const encodeExecTransaction = (
  safe: Address,
  tx: SafeTx,
  signatures: `0x${string}`,
): TransactionAction => ({
  to: safe,
  data: encodeFunctionData({
    abi: execTransactionAbi,
    functionName: "execTransaction",
    args: [
      tx.to,
      tx.value,
      tx.data,
      tx.operation,
      tx.safeTxGas,
      tx.baseGas,
      tx.gasPrice,
      tx.gasToken,
      tx.refundReceiver,
      signatures,
    ],
  }),
});
