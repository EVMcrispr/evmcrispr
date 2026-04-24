import { Num, defineHelper } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "bytes.slice",
  description: "Extract a byte range from a bytes value.",
  returnType: "bytes",
  args: [
    { name: "value", type: "bytes", description: "Input value" },
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
    const s2 = 2 + s * 2;
    const e2 = e !== undefined ? 2 + e * 2 : undefined;
    return "0x" + String(value).slice(s2, e2);
  },
});
