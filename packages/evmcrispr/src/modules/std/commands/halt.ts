import type { TerminalAction } from "../../../types";
import { defineCommand } from "../../../utils";
import type { Std } from "../Std";

export const halt = defineCommand<Std>({
  args: [],
  async run(): Promise<TerminalAction[]> {
    return [
      {
        type: "terminal",
        command: "halt",
        args: {},
      },
    ];
  },
});
