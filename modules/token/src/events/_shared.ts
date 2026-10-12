import {
  type AddressRef,
  account,
  type Candidate,
  floorAfter,
  type LineTemplate,
  type SentencePart,
  type SuggestEnv,
  say,
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

/** One floor per account that gained or lost, the executor first, plus a
 *  floor at what the executor holds when the token moved without it.
 *  `read` answers an account's balance after the run; `check` writes the
 *  line that asserts a floor of it, and says the floor (`least`), or
 *  answers nothing when what it would write asserts nothing. */
export async function balanceFloors(
  env: SuggestEnv,
  net: Map<Address, bigint>,
  read: (account: Address) => Promise<unknown | undefined>,
  check: (
    who: AddressRef,
    floor: bigint,
  ) => { line: LineTemplate; least: SentencePart[] } | null,
): Promise<Candidate[]> {
  const executor = getAddress(env.executor);
  const accounts = [
    executor,
    ...[...net.keys()].filter((a) => a !== executor && (net.get(a) ?? 0n) > 0n),
  ];
  const out: Candidate[] = [];
  for (const address of accounts) {
    const after = await read(address);
    if (typeof after !== "bigint") continue;
    const change = net.get(address) ?? 0n;
    // A balance below what the transfers say was gained contradicts them:
    // the event is not confirmed.
    if (change > 0n && after < change) continue;
    const floor = floorAfter(after - change, after, env.tolerance);
    // `>= 0` holds whatever happens: it asserts nothing.
    if (floor === 0n) continue;
    const own = address === executor;
    const who = account(address, own ? "executor" : "recipient");
    const written = check(who, floor);
    if (!written) continue;
    const { line, least } = written;
    out.push({
      line,
      sentence:
        change <= 0n
          ? say`${who} keeps at least ${least}`
          : own
            ? say`${who} holds at least ${least}`
            : say`${who} holds at least ${least}; that account can make this check fail by moving its funds first`,
      kind: "amount",
    });
  }
  return out;
}
