import { numberToHex } from "viem";

import { ErrorException } from "../../../errors";

import type { ICommand } from "../../../types";

import { ComparisonType, checkArgsLength } from "../../../utils";

import type { Sim } from "../Sim";

export const setBalance: ICommand<Sim> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 2,
    });

    if (!module.mode) {
      throw new ErrorException(
        "set-balance can only be used inside a fork block",
      );
    }

    const [address, amount] = await interpretNodes(c.args);

    if (typeof address !== "string") {
      throw new ErrorException("address must be a string");
    }

    if (typeof amount !== "bigint") {
      throw new ErrorException("amount must be a number (in wei)");
    }

    return [
      {
        type: "rpc",
        method: `${module.mode}_setBalance`,
        params: [address, numberToHex(amount)],
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
