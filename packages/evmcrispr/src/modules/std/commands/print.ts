import { defineCommand } from "../../../utils";
import type { Std } from "..";

export default defineCommand<Std>({
  name: "print",
  args: [{ name: "values", type: "any", rest: true }],
  async run(module, { values }) {
    const varValue = (values as any[]).join("");
    module.evmcrispr.log(varValue);
  },
});
