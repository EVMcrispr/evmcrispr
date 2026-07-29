import type { Address } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import {
  concatHex,
  hashDomain,
  hashMessage,
  hashStruct,
  hashTypedData,
  isAddressEqual,
  keccak256,
  zeroAddress,
} from "viem";
import { MULTISEND, MULTISEND_CALL_ONLY } from "../addresses";
import type { SafeTx } from "./safeTx";
import { getSafeDomain, SAFE_DOMAIN_TYPE, SAFE_TX_TYPE } from "./safeTx";

/** EIP-712 SafeMessage type used by the CompatibilityFallbackHandler. */
export const SAFE_MESSAGE_TYPE = [{ name: "message", type: "bytes" }] as const;

export interface SafeTxHashes {
  /** EIP-712 domain separator of the Safe. */
  domainHash: `0x${string}`;
  /** EIP-712 struct hash of the SafeTx (what Safe docs call "message hash"). */
  messageHash: `0x${string}`;
  safeTxHash: `0x${string}`;
}

export interface SafeMessageHashes {
  domainHash: `0x${string}`;
  messageHash: `0x${string}`;
  safeMessageHash: `0x${string}`;
}

const getDomainHash = (chainId: number, safe: Address): `0x${string}` =>
  hashDomain({
    domain: getSafeDomain(chainId, safe),
    types: { EIP712Domain: SAFE_DOMAIN_TYPE },
  });

/**
 * The three EIP-712 hashes a signer can cross-check against a hardware
 * wallet screen: domain hash, SafeTx struct hash and the final safeTxHash
 * (keccak256(0x1901 ‖ domain ‖ struct), equal to hashSafeTx's output).
 */
export const getSafeTxHashes = (
  chainId: number,
  safe: Address,
  tx: SafeTx,
): SafeTxHashes => {
  const domainHash = getDomainHash(chainId, safe);
  const messageHash = hashStruct({
    data: { ...tx },
    primaryType: "SafeTx",
    types: { SafeTx: SAFE_TX_TYPE },
  });
  return {
    domainHash,
    messageHash,
    safeTxHash: keccak256(concatHex(["0x1901", domainHash, messageHash])),
  };
};

const looksLikeTypedData = (value: unknown): value is Record<string, any> =>
  typeof value === "object" &&
  value !== null &&
  "types" in value &&
  "message" in value;

/**
 * EIP-712 hashes of an off-chain Safe message. `message` is either a plain
 * string (hashed per EIP-191) or an EIP-712 typed-data JSON document; the
 * 32-byte result is wrapped in SafeMessage(bytes) exactly like the
 * CompatibilityFallbackHandler's getMessageHash.
 */
export const getSafeMessageHashes = (
  chainId: number,
  safe: Address,
  message: string,
): SafeMessageHashes & {
  innerHash: `0x${string}`;
  kind: "eip191" | "eip712";
} => {
  let innerHash: `0x${string}`;
  let kind: "eip191" | "eip712" = "eip191";
  const trimmed = message.trim();
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      throw new ErrorException(
        `message looks like JSON but could not be parsed: ${(e as Error).message}`,
      );
    }
    if (!looksLikeTypedData(parsed)) {
      throw new ErrorException(
        "typed-data message must be a JSON document with `types` and `message` fields",
      );
    }
    innerHash = hashTypedData(parsed as any);
    kind = "eip712";
  } else {
    innerHash = hashMessage(message);
  }

  const domainHash = getDomainHash(chainId, safe);
  const messageHash = hashStruct({
    data: { message: innerHash },
    primaryType: "SafeMessage",
    types: { SafeMessage: SAFE_MESSAGE_TYPE },
  });
  return {
    domainHash,
    messageHash,
    safeMessageHash: keccak256(concatHex(["0x1901", domainHash, messageHash])),
    innerHash,
    kind,
  };
};

/**
 * Red flags a signer should review before approving, ported from
 * pcaversaccio/safe-tx-hashes-util.
 */
export const collectSafeTxWarnings = (tx: SafeTx): string[] => {
  const warnings: string[] = [];
  const trustedDelegate =
    isAddressEqual(tx.to, MULTISEND) ||
    isAddressEqual(tx.to, MULTISEND_CALL_ONLY);
  if (tx.operation === 1 && !trustedDelegate) {
    warnings.push(
      `this transaction DELEGATECALLs ${tx.to}, which is not a known MultiSend contract; a delegatecall can take over the Safe — do not sign unless you fully trust that contract`,
    );
  }
  const customGasToken = !isAddressEqual(tx.gasToken, zeroAddress);
  const customRefundReceiver = !isAddressEqual(tx.refundReceiver, zeroAddress);
  if (customGasToken && customRefundReceiver) {
    warnings.push(
      `this transaction pays a gas refund in a custom token (${tx.gasToken}) to a custom receiver (${tx.refundReceiver}) — a known pattern for hidden value extraction; verify gasPrice and baseGas carefully`,
    );
  } else if (customGasToken) {
    warnings.push(
      `this transaction uses a custom gas token (${tx.gasToken}) for refunds`,
    );
  } else if (customRefundReceiver) {
    warnings.push(
      `this transaction sends the gas refund to a custom receiver (${tx.refundReceiver})`,
    );
  }
  if (tx.gasPrice > 0n) {
    warnings.push(
      `this transaction has a non-zero gasPrice (${tx.gasPrice}): the Safe will pay a refund to the executor when it runs`,
    );
  }
  return warnings;
};

const truncateData = (data: `0x${string}`): string => {
  const bytes = (data.length - 2) / 2;
  return data.length > 202
    ? `${data.slice(0, 202)}… (${bytes} bytes)`
    : `${data}${bytes > 0 ? ` (${bytes} bytes)` : ""}`;
};

/**
 * One uniform multi-line block used by safe:verify, safe:propose and
 * safe:execute so the hashes always look the same in the terminal.
 */
export const formatSafeTxHashesLog = (
  safe: Address,
  chainId: number,
  tx: SafeTx,
  hashes: SafeTxHashes,
  warnings: string[],
): string => {
  const lines = [
    `Safe transaction (safe ${safe}, chain ${chainId}, nonce ${tx.nonce})`,
    `  to:              ${tx.to}`,
    `  value:           ${tx.value}`,
    `  data:            ${truncateData(tx.data)}`,
    `  operation:       ${tx.operation} (${tx.operation === 1 ? "DELEGATECALL" : "CALL"})`,
    `  safeTxGas:       ${tx.safeTxGas}`,
    `  baseGas:         ${tx.baseGas}`,
    `  gasPrice:        ${tx.gasPrice}`,
    `  gasToken:        ${tx.gasToken}`,
    `  refundReceiver:  ${tx.refundReceiver}`,
    "",
    `  Domain hash:     ${hashes.domainHash}`,
    `  Message hash:    ${hashes.messageHash}`,
    `  safeTxHash:      ${hashes.safeTxHash}`,
    ...warnings.map((w) => `  ⚠️ WARNING: ${w}`),
  ];
  return lines.join("\n");
};
