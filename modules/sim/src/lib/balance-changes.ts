import { type Address, getAddress, type PublicClient, zeroAddress } from "viem";
import type { BalanceChange } from "./backend";

/** How many accounts' native balances a run's suggestions check. */
export const MAX_NATIVE_ACCOUNTS = 64;

type Prestate = Record<string, { balance?: `0x${string}` }>;

/** The native balances a mined transaction changed, from the node's state
 *  diff (`debug_traceTransaction` with the prestate tracer in diff mode,
 *  which anvil, hardhat and tenderly answer). Undefined when the node does
 *  not trace. The block's fee recipient is left out: it gains on every
 *  transaction, and nothing in the batch sent it that. */
export async function tracedBalanceChanges(
  client: PublicClient,
  hash: `0x${string}`,
  miner: Address | undefined,
): Promise<BalanceChange[] | undefined> {
  let diff: { pre?: Prestate; post?: Prestate };
  try {
    diff = (await client.request({
      method: "debug_traceTransaction" as never,
      params: [
        hash,
        { tracer: "prestateTracer", tracerConfig: { diffMode: true } },
      ] as never,
    })) as { pre?: Prestate; post?: Prestate };
  } catch {
    return undefined;
  }
  if (!diff || typeof diff !== "object" || !diff.post) return undefined;
  const skip = new Set([zeroAddress, ...(miner ? [getAddress(miner)] : [])]);
  const pre = new Map(
    Object.entries(diff.pre ?? {}).map(([a, s]) => [getAddress(a), s]),
  );
  const changes: BalanceChange[] = [];
  for (const [raw, state] of Object.entries(diff.post)) {
    const address = getAddress(raw);
    // In diff mode `post` holds only what changed: no balance, no change.
    if (state.balance === undefined || skip.has(address)) continue;
    const before = BigInt(pre.get(address)?.balance ?? "0x0");
    const after = BigInt(state.balance);
    if (after !== before) changes.push({ address, before, after });
  }
  return changes;
}

/** A run's native balance changes, transaction by transaction, folded into
 *  one per account: its balance before the first transaction that changed
 *  it and after the last. */
export function foldBalanceChanges(
  into: Map<Address, { before: bigint; after?: bigint }>,
  changes: readonly BalanceChange[],
): void {
  for (const { address, before, after } of changes) {
    const key = getAddress(address);
    const known = into.get(key);
    into.set(key, { before: known ? known.before : before, after });
  }
}
