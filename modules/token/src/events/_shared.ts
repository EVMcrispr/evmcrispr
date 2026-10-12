import {
  type Candidate,
  floorAfter,
  type SuggestEnv,
  truncateAddress,
} from "@evmcrispr/sdk";
import { type Address, getAddress, zeroAddress } from "viem";

/** Net change per account over a run's transfers, in first-seen order. */
export function netByAccount(
  moves: { from: Address; to: Address; value: bigint }[],
): Map<Address, bigint> {
  const net = new Map<Address, bigint>();
  for (const { from, to, value } of moves) {
    if (from !== zeroAddress)
      net.set(getAddress(from), (net.get(getAddress(from)) ?? 0n) - value);
    if (to !== zeroAddress)
      net.set(getAddress(to), (net.get(getAddress(to)) ?? 0n) + value);
  }
  return net;
}

/** One floor per account that gained or lost, the executor first, plus "no
 *  decrease" for the executor when the token moved without it. `read`
 *  answers an account's balance after the run; `expr` spells its read. */
export async function balanceFloors(
  env: SuggestEnv,
  net: Map<Address, bigint>,
  read: (account: Address) => Promise<unknown | undefined>,
  expr: (account: Address) => string,
  what: string,
): Promise<Candidate[]> {
  const executor = getAddress(env.executor);
  const accounts = [
    executor,
    ...[...net.keys()].filter((a) => a !== executor && (net.get(a) ?? 0n) > 0n),
  ];
  const out: Candidate[] = [];
  for (const account of accounts) {
    const after = await read(account);
    if (typeof after !== "bigint") continue;
    const change = net.get(account) ?? 0n;
    // A balance below what the transfers say was gained contradicts them:
    // the event is not confirmed.
    if (change > 0n && after < change) continue;
    const floor = floorAfter(after - change, after, env.tolerance);
    // `>= 0` holds whatever happens: it asserts nothing.
    if (floor === 0n) continue;
    const own = account === executor;
    out.push({
      line: `assert ${expr(account)} >= ${floor}`,
      description:
        change === 0n
          ? `${what} balance of ${truncateAddress(account)} does not decrease`
          : change > 0n && own
            ? `${truncateAddress(account)} receives at least the simulated ${what}`
            : change > 0n
              ? `${truncateAddress(account)} holds at least the ${what} it received; that account can make this check fail by moving it first`
              : `${truncateAddress(account)} spends no more ${what} than simulated`,
      kind: "amount",
    });
  }
  return out;
}
