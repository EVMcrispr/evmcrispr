import {
  defineHelper,
  ErrorException,
  preserveAbiReturnNumbers,
  splitReadAbiSignature,
} from "@evmcrispr/sdk";
import { type AbiFunction, parseAbiItem } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "get",
  batchable: false,
  description: "Call a read-only contract function and return its result.",
  returnType: "any",
  args: [
    {
      name: "address",
      type: "address",
      description: "Contract or account address",
    },
    {
      name: "abi",
      type: "read-abi",
      description:
        'Signature with return types (e.g. `"balanceOf(address)(uint256)"`)',
    },
    {
      name: "params",
      type: "any",
      description: "Function arguments",
      rest: true,
    },
  ],
  async run(module, { address, abi, params }) {
    const parts = splitReadAbiSignature(abi);
    if (!parts) {
      throw new ErrorException(
        `expected a valid read-abi signature, but got "${abi}"`,
      );
    }
    const { body, returns } = parts;

    const client = await module.getClient();
    const fn = parseAbiItem(
      `function ${body} external view returns ${returns}`,
    ) as AbiFunction;
    const result = await client.readContract({
      address,
      abi: [fn],
      functionName: body.split("(")[0],
      args: params,
    });

    return preserveAbiReturnNumbers(fn.outputs, result) as never;
  },
});
