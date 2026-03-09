import { defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "concat",
  description: "Concatenate arrays together.",
  returnType: "array",
  args: [
    { name: "first", type: "array" },
    { name: "rest", type: "array", rest: true },
  ],
  async run(_, { first, rest }) {
    return [first, ...rest].flat();
  },
});
