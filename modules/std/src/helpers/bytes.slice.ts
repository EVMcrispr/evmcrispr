import { Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "bytes.slice",
  description: "Extract a byte range from a bytes value.",
  returnType: "bytes",
  args: [
    { name: "value", type: "bytes" },
    { name: "start", type: "number" },
    { name: "end", type: "number", optional: true },
  ],
  async run(_, { value, start, end }) {
    const s = Number(Num.coerce(start).toBigInt());
    const e = end !== undefined ? Number(Num.coerce(end).toBigInt()) : undefined;
    const s2 = 2 + s * 2;
    const e2 = e !== undefined ? 2 + e * 2 : undefined;
    return "0x" + String(value).slice(s2, e2);
  },
});
