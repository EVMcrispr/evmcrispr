import {
  defineHelper,
  ErrorException,
  isFunctionSignature,
} from "@evmcrispr/sdk";
import { parseAbiItem } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "get",
  returnType: "any",
  args: [
    { name: "address", type: "address" },
    { name: "abi", type: "string" },
    { name: "params", type: "any", rest: true },
  ],
  async run(module, { address, abi, params }) {
    const [body, returns, index] = abi.split(":");

    if (!isFunctionSignature(body)) {
      throw new ErrorException(
        `expected a valid function signature, but got "${abi}"`,
      );
    }

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
