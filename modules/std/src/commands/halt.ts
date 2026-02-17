import type { TerminalAction } from "@evmcrispr/sdk";
import { defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "halt",
  description: "Stop script execution immediately.",
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
