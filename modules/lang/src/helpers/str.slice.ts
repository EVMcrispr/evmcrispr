import { defineHelper, Num } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "str.slice",
  description: "Extract a section of a string.",
  returnType: "string",
  args: [
    { name: "value", type: "string", description: "Input value" },
    { name: "start", type: "number", description: "Start index (inclusive)" },
    {
      name: "end",
      type: "number",
      description: "End index (exclusive)",
      optional: true,
    },
  ],
  async run(_, { value, start, end }) {
    const s = Num(start).toNumber();
    const e = end !== undefined ? Num(end).toNumber() : undefined;
    return String(value).slice(s, e);
  },
});
