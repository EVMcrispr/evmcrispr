import type { TerminalAction } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

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
