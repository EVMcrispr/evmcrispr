import {
  defineHelper,
  ErrorException,
  ErrorInvalid,
  fieldItem,
} from "@evmcrispr/sdk";
import {
  chainArgWithLens,
  hashParamOf,
  lensedDataOperand,
  requireBytesLike,
  sha256Param,
} from "@evmcrispr/sdk/onchain";
import { keccak256, sha256, toHex } from "viem";
import type Std from "..";

const algorithms = {
  keccak256,
  sha256,
} as const;

export default defineHelper<Std>({
  name: "hash",
  description:
    "Compute the hash of a string with keccak256 (default) or sha256.",
  compileDescription:
    "Hashes the decoded string or bytes a call returns, not its ABI envelope.",
  returnType: "bytes32",
  args: [
    {
      name: "text",
      type: "string",
      description: "String to hash (e.g. a function signature)",
    },
    {
      name: "algorithm",
      type: "string",
      optional: true,
      description: "`keccak256` (default) or `sha256`",
    },
  ],
  completions: {
    algorithm: () => Object.keys(algorithms).map(fieldItem),
  },
  async run(_, { text, algorithm = "keccak256" }) {
    const fn = algorithms[algorithm as keyof typeof algorithms];
    if (!fn) {
      throw new ErrorInvalid(
        `unknown hash algorithm "${algorithm}"; expected one of: ${Object.keys(algorithms).join(", ")}`,
      );
    }
    return fn(toHex(text));
  },
  compile: async (ctx, node) => {
    if (node.args.length < 1 || node.args.length > 2) {
      throw new ErrorException(
        "@hash! expects a single call argument (plus an optional algorithm)",
      );
    }
    let algorithm = "keccak256";
    if (node.args.length === 2) {
      algorithm = String(await ctx.interpreters.interpretNode(node.args[1]));
      if (algorithm !== "keccak256" && algorithm !== "sha256") {
        throw new ErrorException(
          `@hash! computes keccak256 or sha256 on-chain; "${algorithm}" is not supported at assertion time`,
        );
      }
    }
    const arg = await chainArgWithLens(ctx, "hash!", node.args[0]);
    requireBytesLike(arg, "hash!");
    const s = lensedDataOperand(ctx, arg);
    return {
      kind: "call",
      param: algorithm === "sha256" ? sha256Param(ctx, s) : hashParamOf(ctx, s),
      cat: "Bytes32",
    };
  },
});
