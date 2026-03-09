import { ErrorException, defineHelper, isHexString } from "@evmcrispr/sdk";
import { toHex } from "viem";
import type Std from "..";

const UINT256_MAX = 2n ** 256n - 1n;

export default defineHelper<Std>({
  name: "bytes.not",
  description: "Bitwise NOT of a bytes value (256-bit complement).",
  returnType: "bytes",
  args: [{ name: "value", type: "bytes" }],
  async run(_, { value }) {
    if (typeof value !== "string" || !isHexString(value)) {
      throw new ErrorException("@bytes.not expects a hex bytes value");
    }
    return toHex(UINT256_MAX ^ BigInt(value));
  },
});
