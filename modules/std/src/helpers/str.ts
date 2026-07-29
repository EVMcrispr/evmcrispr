import { defineHelper, fieldItem, isHexString } from "@evmcrispr/sdk";
import { fromHex } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "str",
  description:
    "Convert a value to its string representation, or decode hex bytes as UTF-8.",
  returnType: "string",
  args: [
    { name: "value", type: "any", description: "Input value" },
    {
      name: "encoding",
      type: "string",
      optional: true,
      description: "`utf8` to decode hex bytes as a UTF-8 string",
    },
  ],
  completions: { encoding: () => ["utf8"].map(fieldItem) },
  async run(_, { value, encoding }) {
    if (encoding === "utf8") {
      const hex =
        typeof value === "string" && isHexString(value) ? value : String(value);
      return fromHex(hex as `0x${string}`, "string");
    }
    return String(value);
  },
});
