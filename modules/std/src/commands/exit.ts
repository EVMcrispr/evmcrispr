import { defineCommand, ExitSignal } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "exit",
  description: "Stop script execution immediately.",
  batchable: false,
  args: [],
  async run(): Promise<never> {
    // Interpret-time signal: unwinds the whole interpretation (through
    // loops and def bodies) and is caught by `executeScript`, which
    // reports a clean stop rather than an error.
    throw new ExitSignal();
  },
});
