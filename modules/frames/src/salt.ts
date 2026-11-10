import { asNum, ErrorException } from "@evmcrispr/sdk";

const MAX = 2n ** 256n;

/** A salt as `frames:new-account --salt` and `@frames:account` take it. */
export function saltValue(value: unknown, label: string): bigint {
  if (value === undefined) return 0n;
  const n = asNum(value);
  const salt = n?.isInteger() ? n.toBigInt() : undefined;
  if (salt === undefined || salt < 0n || salt >= MAX)
    throw new ErrorException(
      `${label} must be a non-negative integer below 2^256, not ${String(value)}`,
    );
  return salt;
}
