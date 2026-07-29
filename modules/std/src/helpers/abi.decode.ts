import { defineHelper, HelperFunctionError } from "@evmcrispr/sdk";
import type { AbiParameter } from "viem";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "abi.decode",
  description:
    "Decode ABI-encoded bytes into values given a comma-separated type list.",
  returnType: "array",
  args: [
    {
      name: "types",
      type: "string",
      description: 'Comma-separated Solidity types (e.g. "uint256,address")',
    },
    { name: "data", type: "bytes", description: "ABI-encoded hex data" },
  ],
  async run(_, { types, data }, { node }) {
    let params: readonly AbiParameter[];
    try {
      params = parseAbiParameters(types) as readonly AbiParameter[];
    } catch (_err) {
      throw new HelperFunctionError(node, `invalid type list: "${types}"`);
    }

    try {
      const decoded = decodeAbiParameters(params, data);
      return [...decoded] as any;
    } catch (err) {
      throw new HelperFunctionError(
        node,
        `failed to decode: ${(err as Error).message}`,
      );
    }
  },
});
