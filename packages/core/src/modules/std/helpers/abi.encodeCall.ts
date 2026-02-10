import type { AbiFunction } from "viem";
import { parseAbiItem } from "viem";
import { HelperFunctionError } from "../../../errors";
import { defineHelper, encodeCalldata } from "../../../utils";
import type { Std } from "..";

export default defineHelper<Std>({
  name: "abi.encodeCall",
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
