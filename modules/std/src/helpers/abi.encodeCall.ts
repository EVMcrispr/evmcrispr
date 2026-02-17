import {
  defineHelper,
  encodeCalldata,
  HelperFunctionError,
} from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { parseAbiItem } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "abi.encodeCall",
  description: "ABI-encode a function call from its signature and arguments.",
  returnType: "bytes",
  args: [
    { name: "signature", type: "string" },
    { name: "params", type: "any", rest: true },
  ],
  async run(_, { signature, params }, { node }) {
    let fnABI: AbiFunction;
    try {
      const fullSignature = signature.startsWith("function")
        ? signature
        : `function ${signature}`;
      fnABI = parseAbiItem(fullSignature) as AbiFunction;
    } catch (_err) {
      throw new HelperFunctionError(
        node,
        `invalid function signature: "${signature}"`,
      );
    }

    return encodeCalldata(fnABI, params);
  },
});
