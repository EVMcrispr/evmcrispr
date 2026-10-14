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
