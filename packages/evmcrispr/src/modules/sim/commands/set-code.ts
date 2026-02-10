import { ErrorException } from "../../../errors";

import type { ICommand } from "../../../types";

import { ComparisonType, checkArgsLength } from "../../../utils";

import type { Sim } from "../Sim";

export const setCode: ICommand<Sim> = {
  async run(module, c, { interpretNodes }) {
    checkArgsLength(c, {
      type: ComparisonType.Equal,
      minValue: 2,
    });

    if (!module.mode) {
      throw new ErrorException("set-code can only be used inside a fork block");
    }

    const [address, bytecode] = await interpretNodes(c.args);

    if (typeof address !== "string") {
      throw new ErrorException("address must be a string");
    }

    if (typeof bytecode !== "string") {
      throw new ErrorException("bytecode must be a hex string");
    }

    return [
      {
        type: "rpc",
        method: `${module.mode}_setCode`,
        params: [address, bytecode],
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
