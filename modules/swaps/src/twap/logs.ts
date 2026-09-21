import type { Address, PublicClient } from "viem";

export async function birthBlock(
  client: PublicClient,
  address: Address,
  head: bigint,
): Promise<bigint> {
  let lo = 0n;
  let hi = head;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.getCode({ address, blockNumber: mid });
    if (code && code !== "0x") hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

/** RPC range limits must not silently turn missing history into zero fills. */
export async function pagedLogs<T>(
  query: (from: bigint, to: bigint) => Promise<T[]>,
  from: bigint,
  to: bigint,
) {
  const logs: T[] = [];
  let cursor = from;
  let width = 5000n;
  let requests = 0;
  while (cursor <= to && requests++ < 100) {
    const end = cursor + width - 1n < to ? cursor + width - 1n : to;
    try {
      const page = await query(cursor, end);
      if (page.length + logs.length > 10_000)
        return {
          logs,
          complete: false,
          reason: "History record budget exhausted",
        };
      logs.push(...page);
      cursor = end + 1n;
    } catch {
      if (width === 1n)
        return { logs, complete: false, reason: "RPC history unavailable" };
      width = width / 2n || 1n;
    }
  }
  return {
    logs,
    complete: cursor > to,
    reason: cursor > to ? null : "History request budget exhausted",
  };
}
