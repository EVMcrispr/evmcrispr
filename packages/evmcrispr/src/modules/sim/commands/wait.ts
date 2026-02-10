import { numberToHex } from "viem";

import { ErrorException } from "../../../errors";

import type { ICommand, RpcAction } from "../../../types";

import { ComparisonType, checkArgsLength } from "../../../utils";

import type { Sim } from "../Sim";

/**
 * Build the RPC actions to advance time by `duration` seconds.
 *
 * Tenderly:
 *   `evm_increaseBlocks` is a cheap "skip" operation that just bumps the
 *   block number without actually creating each block, so we can safely
 *   request `duration / period` blocks.
 *
 * Anvil / Hardhat:
 *   `${mode}_mine` actually creates every single block, so requesting
 *   hundreds of thousands of blocks hangs the node. Instead we:
 *     1. `evm_increaseTime` to advance the clock.
 *     2. `${mode}_mine` a single block to seal the new timestamp.
 */
function buildWaitActions(
  module: Sim,
  duration: bigint,
  period: bigint,
): RpcAction[] {
  const mode = module.mode!;
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
    const totalBlocks = duration / period;
    return [mine(totalBlocks - 1n), increaseTime, mine(1n)];
  }

  // Anvil / Hardhat: advance time, then mine 1 block to seal it
  return [increaseTime, mine(1n)];
}

export const wait: ICommand<Sim> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 1,
    });

    if (!module.mode) {
      throw new ErrorException("wait can only be used inside a fork block");
    }

    const [duration, period = 1n] = await interpretNodes(c.args);

    if (typeof duration !== "bigint") {
      throw new ErrorException("duration must be a number");
    }

    if (typeof period !== "bigint") {
      throw new ErrorException("period must be a number");
    }

    return buildWaitActions(module, duration, period);
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
