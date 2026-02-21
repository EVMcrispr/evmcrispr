import {
  defineHelper,
  ErrorException,
  splitReadAbiSignature,
} from "@evmcrispr/sdk";
import { parseAbiItem } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "get",
  description: "Call a read-only contract function and return its result.",
  returnType: "any",
  args: [
    { name: "address", type: "address" },
    { name: "abi", type: "read-abi" },
    { name: "params", type: "any", rest: true, signatureArgIndex: 1 },
  ],
  async run(module, { address, abi, params }) {
    const parts = splitReadAbiSignature(abi);
    if (!parts) {
      throw new ErrorException(
        `expected a valid read-abi signature, but got "${abi}"`,
      );
    }
    const { body, returns, index } = parts;

    const client = await module.getClient();
    const result = await client.readContract({
      address,
      abi: [parseAbiItem(`function ${body} external view returns ${returns}`)],
      functionName: body.split("(")[0],
      args: params,
    });

    return index ? result[index] : result;
  },
});
