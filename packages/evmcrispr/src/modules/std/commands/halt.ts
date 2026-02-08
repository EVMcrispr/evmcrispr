import type { ICommand, TerminalAction } from "../../../types";
import { ComparisonType, checkArgsLength } from "../../../utils";
import type { Std } from "../Std";

export const halt: ICommand<Std> = {
  async run(_module, c, { interpretNodes }): Promise<TerminalAction[]> {
    checkArgsLength(c, {
      type: ComparisonType.Between,
      minValue: 0,
      maxValue: 0,
    });

    return [
      {
        type: "terminal",
        command: "halt",
        args: {},
      },
    ];
  },
  buildCompletionItemsForArg() {
    return [];
  },
  async runEagerExecution() {
    return;
  },
};
