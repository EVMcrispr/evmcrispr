import { defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "concat",
  description: "Concatenate arrays together.",
  returnType: "array",
  args: [
    { name: "first", type: "array", description: "First array to concatenate" },
    {
      name: "rest",
      type: "array",
      description: "Additional arrays to append",
      rest: true,
    },
  ],
  async run(_, { first, rest }) {
    return [first, ...rest].flat();
  },
});
