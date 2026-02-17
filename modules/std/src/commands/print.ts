import { defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

export default defineCommand<Std>({
  name: "print",
  description: "Log values to the console output.",
  args: [{ name: "values", type: "any", rest: true }],
  async run(module, { values }) {
    const varValue = (values as any[]).join("");
    module.context.log(varValue);
  },
});
