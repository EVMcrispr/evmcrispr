import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type Std from "..";

export default defineHelper<Std>({
  name: "bytes.at",
  description: "Access a single byte by index in a bytes value.",
  returnType: "bytes",
  args: [
    { name: "value", type: "bytes", description: "Input value" },
    { name: "index", type: "number", description: "Zero-based byte index" },
  ],
  async run(_, { value, index }) {
    const hex = String(value);
    const byteLen = (hex.length - 2) / 2;
    const i = Num(index).toNumber();
    const resolved = i < 0 ? byteLen + i : i;

    if (resolved < 0 || resolved >= byteLen) {
      throw new ErrorException(
        `@bytes.at: index ${i} out of bounds for ${byteLen} bytes`,
      );
    }

    return "0x" + hex.slice(2 + resolved * 2, 2 + resolved * 2 + 2);
  },
});
