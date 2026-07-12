import type { RpcAction } from "@evmcrispr/sdk";
import { numberToHex } from "viem";
import type Sim from "..";
import { rpcPrefix } from "./modes";

// Assumed seconds per block when deriving Tenderly's block-skip count.
const BLOCK_PERIOD_SECONDS = 1n;

/**
 * Build the RPC actions to advance time by `duration` seconds.
 *
 * Tenderly:
 *   `evm_increaseBlocks` is a cheap "skip" operation that just bumps the
 *   block number without actually creating each block, so we can safely
 *   request one block per second of `duration`.
 *
 * Anvil / Hardhat:
 *   `${mode}_mine` actually creates every single block, so requesting
 *   hundreds of thousands of blocks hangs the node. Instead we:
 *     1. `evm_increaseTime` to advance the clock.
 *     2. `${mode}_mine` a single block to seal the new timestamp.
 */
export function buildWaitActions(module: Sim, duration: bigint): RpcAction[] {
  const mode = rpcPrefix(module.mode!);
  const increaseTime: RpcAction = {
    type: "rpc",
    method: "evm_increaseTime",
    params: [numberToHex(duration)],
  };
  const mine = (blocks: bigint): RpcAction => ({
    type: "rpc",
    method: mode === "tenderly" ? "evm_increaseBlocks" : `${mode}_mine`,
    params: [numberToHex(blocks)],
  });

  if (mode === "tenderly") {
    // Tenderly's evm_increaseBlocks is a cheap skip — safe with large counts
    const totalBlocks = duration / BLOCK_PERIOD_SECONDS;
    return [mine(totalBlocks - 1n), increaseTime, mine(1n)];
  }

  // Anvil / Hardhat: advance time, then mine 1 block to seal it
  return [increaseTime, mine(1n)];
}
