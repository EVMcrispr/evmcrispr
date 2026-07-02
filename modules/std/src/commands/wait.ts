import { defineCommand, type TerminalAction } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "wait",
  description:
    "Wait for a duration before executing the next action (fork simulations advance the chain's clock instead).",
  batchable: false,
  args: [
    {
      name: "duration",
      type: "number",
      description: "Time to wait, in seconds",
    },
  ],
  async run(_, { duration }) {
    const wait: TerminalAction = {
      type: "terminal",
      command: "wait",
      args: { seconds: Number(duration) },
    };
    return [wait];
  },
});
