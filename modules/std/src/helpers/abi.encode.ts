import {
  defineHelper,
  encodeParams,
  HelperFunctionError,
} from "@evmcrispr/sdk";
import type { AbiParameter } from "viem";
import { parseAbiParameters } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "abi.encode",
  description:
    "ABI-encode values given a comma-separated type list, like Solidity abi.encode.",
  returnType: "bytes",
  args: [
    {
      name: "types",
      type: "string",
      description: "Comma-separated Solidity types (e.g. `uint256,address`)",
    },
    {
      name: "values",
      type: "any",
      description: "Values to encode, one per type",
      rest: true,
    },
  ],
  async run(_, { types, values }, { node }) {
    let params: readonly AbiParameter[];
    try {
      params = parseAbiParameters(types) as readonly AbiParameter[];
    } catch (_err) {
      throw new HelperFunctionError(node, `invalid type list: "${types}"`);
    }

    try {
      return encodeParams(params, values, "abi.encode values");
    } catch (err) {
      throw new HelperFunctionError(node, (err as Error).message);
    }
  },
});
