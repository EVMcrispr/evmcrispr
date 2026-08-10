import type { Transport } from "viem";
import { http } from "viem";
import { mainnet } from "viem/chains";

import { getTransports } from "../client";

const ANVIL = http("http://127.0.0.1:8545");

/**
 * Transports with mainnet routed at the shared anvil instead of DRPC.
 *
 * For a suite that has re-forked the shared node to mainnet (`resetAnvil(1)`,
 * or `sim:fork --using anvil` as `modules/ens/test/integration/transfer-fork.test.ts`
 * does) and then called `switchChainId(mainnet.id)`.
 *
 * Needed because parity only means anything if both faces read the SAME
 * state. `getTransports()[1]` is DRPC at head, while a compiled operand
 * resolves against the fork — so without this the two disagree on anything
 * mutable and it reads as a parity bug.
 *
 * Note the interpreter's chain id is its own field, not `eth_chainId`: anvil
 * is spawned with `--chain-id 100` and keeps reporting 100 across a re-fork,
 * but `switchChainId` is what every module actually branches on.
 */
export function getMainnetForkTransports(): Record<number, Transport> {
  return { ...getTransports(), [mainnet.id]: ANVIL };
}
