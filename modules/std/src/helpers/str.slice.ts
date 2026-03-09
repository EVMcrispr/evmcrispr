import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "str.slice",
  description: "Extract a section of a string.",
  returnType: "string",
  args: [
    { name: "value", type: "string" },
    { name: "start", type: "number" },
    { name: "end", type: "number", optional: true },
  ],
  async run(_, { value, start, end }) {
    const s = Number(Num.coerce(start).toBigInt());
    const e = end !== undefined ? Number(Num.coerce(end).toBigInt()) : undefined;
    return String(value).slice(s, e);
  },
});
