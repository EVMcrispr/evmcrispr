import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "slice",
  description: "Extract a section of a string or array.",
  returnType: ["string", "array"],
  args: [
    { name: "value", type: ["string", "array"] },
    { name: "start", type: "number" },
    { name: "end", type: "number", optional: true },
  ],
  async run(_, { value, start, end }) {
    const s = Number(Num.coerce(start).toBigInt());
    const e = end !== undefined ? Number(Num.coerce(end).toBigInt()) : undefined;

    if (Array.isArray(value)) {
      return value.slice(s, e);
    }
    return String(value).slice(s, e);
  },
});
