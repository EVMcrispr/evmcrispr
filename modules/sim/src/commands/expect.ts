import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Sim from "..";

export default defineCommand<Sim>({
  name: "expect",
  description: "Assert that a condition is true.",
  args: [
    {
      name: "condition",
      type: "bool",
      description: "Boolean condition to assert",
    },
  ],
  async run(module, { condition }) {
    module.context.log(
      condition ? ":success: Assertion passed" : ":error: Assertion failed",
    );

    if (!condition) {
      throw new ErrorException("An assertion failed.");
    }
    return [];
  },
});
