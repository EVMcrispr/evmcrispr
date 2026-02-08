import { toHex } from "viem";

import { ErrorException } from "../../../errors";

import type { ICommand } from "../../../types";

import { ComparisonType, checkArgsLength } from "../../../utils";

import type { Sim } from "../Sim";

export const wait: ICommand<Sim> = {
  async run(_, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Greater,
      minValue: 1,
    });

    const [duration, period = 1n] = await interpretNodes(c.args);

    if (typeof duration !== "bigint") {
      throw new ErrorException("duration must be a number");
    }

    if (typeof period !== "bigint") {
      throw new ErrorException("period must be a number");
    }

    return [
      {
        type: "rpc",
        method: "evm_increaseBlocks",
        params: [toHex(duration / period - 1n)],
      },
      {
        type: "rpc",
        method: "evm_increaseTime",
        params: [toHex(duration)],
      },
      {
        type: "rpc",
        method: "evm_increaseBlocks",
        params: [toHex(1n)],
      },
    ];
  },
  async runEagerExecution() {
    return;
  },
  buildCompletionItemsForArg() {
    return [];
  },
};
