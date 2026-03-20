import { defineHelper, encodeCalldata } from "@evmcrispr/sdk";
import type { AbiFunction } from "viem";
import { parseAbiItem } from "viem";
import type Std from "..";

export default defineHelper<Std>({
  name: "abi.encodeCall",
  description: "ABI-encode a function call from its signature and arguments.",
  returnType: "bytes",
  args: [
    { name: "signature", type: "write-abi", description: "Function signature (e.g. `transfer(address,uint256)`)" },
    { name: "params", type: "any", description: "Arguments to encode", rest: true },
  ],
  async run(_, { signature, params }) {
    const bare = signature.startsWith("function ")
      ? signature.slice(9)
      : signature;
    const fnABI = parseAbiItem(`function ${bare}`) as AbiFunction;
    return encodeCalldata(fnABI, params);
  },
});
