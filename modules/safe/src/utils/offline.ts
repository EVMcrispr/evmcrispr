import type { Address } from "@evmcrispr/sdk";
import { ErrorException, Num } from "@evmcrispr/sdk";
import {
  concatHex,
  type Hex,
  isAddress,
  isAddressEqual,
  recoverAddress,
} from "viem";
import { hashSafeTx, type SafeTx } from "./safeTx";

export const stringifySafeTransaction = (value: unknown): string =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

/** Portable data, independent of the service and of any filesystem host. */
export const exportSafeTransaction = (
  chainId: number,
  safe: Address,
  tx: SafeTx,
  signatures: Hex[],
): string =>
  stringifySafeTransaction({
    chainId,
    safe,
    tx,
    safeTxHash: hashSafeTx(chainId, safe, tx),
    signatures,
    version: 1,
    kind: "transaction",
  });

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ErrorException("expected a Safe transaction JSON object");
  }
  return value as Record<string, unknown>;
};

export const safeUint = (value: unknown, field: string): bigint => {
  if (value instanceof Num && value.isInteger()) value = value.toBigInt();
  if (
    (typeof value !== "string" &&
      typeof value !== "bigint" &&
      typeof value !== "number") ||
    (typeof value === "number" && !Number.isSafeInteger(value)) ||
    !/^\d+$/.test(String(value))
  ) {
    throw new ErrorException(
      `${field} must be an unsigned integer (use decimal strings for large JSON numbers)`,
    );
  }
  const n = BigInt(value);
  if (n >= 1n << 256n) throw new ErrorException(`${field} exceeds uint256`);
  return n;
};

const address = (value: unknown, field: string): Address => {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new ErrorException(`invalid Safe transaction ${field} address`);
  }
  return value;
};

export const importSafeTransaction = (
  json: string,
  chainId: number,
  safe: Address,
): { tx: SafeTx; signatures: Hex[] } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ErrorException(
      "expected Safe transaction JSON; a hash or nonce alone cannot recover transaction data without the Safe Transaction Service",
    );
  }
  const data = record(parsed);
  if (data.version !== undefined && data.version !== 1)
    throw new ErrorException("unsupported Safe transaction JSON version");
  if (data.kind !== undefined && data.kind !== "transaction")
    throw new ErrorException("expected a Safe transaction, got a Safe message");
  if (safeUint(data.chainId, "chainId") !== BigInt(chainId)) {
    throw new ErrorException(
      "Safe transaction chainId does not match the connected chain",
    );
  }
  if (!isAddressEqual(address(data.safe, "safe"), safe)) {
    throw new ErrorException(
      `Safe transaction belongs to Safe ${data.safe}, not ${safe}`,
    );
  }
  const raw = record(data.tx);
  if (
    typeof raw.data !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(raw.data)
  ) {
    throw new ErrorException("Safe transaction data must be hex-encoded bytes");
  }
  if (raw.operation !== 0 && raw.operation !== 1) {
    throw new ErrorException("Safe transaction operation must be 0 or 1");
  }
  const tx: SafeTx = {
    to: address(raw.to, "to"),
    value: safeUint(raw.value, "value"),
    data: raw.data as Hex,
    operation: raw.operation,
    safeTxGas: safeUint(raw.safeTxGas, "safeTxGas"),
    baseGas: safeUint(raw.baseGas, "baseGas"),
    gasPrice: safeUint(raw.gasPrice, "gasPrice"),
    gasToken: address(raw.gasToken, "gasToken"),
    refundReceiver: address(raw.refundReceiver, "refundReceiver"),
    nonce: safeUint(raw.nonce, "nonce"),
  };
  if (
    typeof data.safeTxHash !== "string" ||
    hashSafeTx(chainId, safe, tx).toLowerCase() !==
      data.safeTxHash.toLowerCase()
  ) {
    throw new ErrorException(
      "safeTxHash mismatch: exported Safe transaction data has changed",
    );
  }
  if (!Array.isArray(data.signatures))
    throw new ErrorException("Safe transaction signatures must be an array");
  return { tx, signatures: data.signatures.map(normalizeSafeSignature) };
};

/** EIP-712 EOA signatures only. v=0/1 wallet output is normalized to 27/28.
 * Contract and pre-approved signatures have a different encoding and must
 * never be mistaken for locally collected ECDSA signatures. */
export const normalizeSafeSignature = (value: unknown): Hex => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) {
    throw new ErrorException("expected a 65-byte EIP-712 owner signature");
  }
  const v = Number.parseInt(value.slice(-2), 16);
  if (![0, 1, 27, 28].includes(v)) {
    throw new ErrorException(
      "expected an EIP-712 EOA signature (v 27 or 28); pass contract signatures as {type: contract, owner, signature}",
    );
  }
  return `${value.slice(0, -2)}${(v < 2 ? v + 27 : v).toString(16)}` as Hex;
};

export const validateSafeSignatures = async (
  hash: Hex,
  signatures: readonly unknown[],
  owners: Address[],
) => {
  const seen = new Set<string>();
  const recovered = await Promise.all(
    signatures.map(async (input) => {
      const signature = normalizeSafeSignature(input);
      let owner: Address;
      try {
        owner = await recoverAddress({ hash, signature });
      } catch {
        throw new ErrorException("invalid EIP-712 Safe signature");
      }
      if (!owners.some((candidate) => isAddressEqual(candidate, owner))) {
        throw new ErrorException(
          `signature recovers ${owner}, which is not a current owner of the Safe`,
        );
      }
      const key = owner.toLowerCase();
      if (seen.has(key))
        throw new ErrorException(`duplicate signature for Safe owner ${owner}`);
      seen.add(key);
      return { owner, signature };
    }),
  );
  return recovered.sort((a, b) =>
    a.owner.toLowerCase().localeCompare(b.owner.toLowerCase()),
  );
};

export const packSafeSignatures = async (
  hash: Hex,
  signatures: readonly unknown[],
  owners: Address[],
  threshold: bigint,
): Promise<Hex> => {
  const valid = await validateSafeSignatures(hash, signatures, owners);
  if (BigInt(valid.length) < threshold) {
    throw new ErrorException(
      `Safe transaction has ${valid.length} of ${threshold} required owner signatures`,
    );
  }
  return concatHex(valid.map((s) => s.signature));
};
