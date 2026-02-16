import { BindingsSpace, defineCommand } from "@evmcrispr/sdk";
import type Std from "..";

const { USER } = BindingsSpace;

export default defineCommand<Std>({
  name: "set",
  args: [
    { name: "variable", type: "variable" },
    { name: "value", type: "any" },
  ],
  async run(module, { variable, value }) {
    module.bindingsManager.setBinding(
      variable,
      value,
      USER,
      true,
      undefined,
      true,
    );
  },
});
