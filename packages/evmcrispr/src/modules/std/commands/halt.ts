import type { TerminalAction } from "../../../types";
import { defineCommand } from "../../../utils";
import type { Std } from "..";

export default defineCommand<Std>({
  name: "halt",
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
