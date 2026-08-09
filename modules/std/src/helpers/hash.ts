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
    "Compute the hash of a string with keccak256 (default) or sha256. As @hash! the keccak256 of the decoded string/bytes return of a call, computed on-chain — compare long strings or blobs against a precomputed digest of the payload bytes.",
  returnType: "bytes32",
  args: [
    {
      name: "text",
      type: "string",
      description:
        "String to hash (e.g. a function signature); in @hash! a `::` call expression (or chain) returning a string or bytes value",
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
    if (node.args.length === 2) {
      // Only keccak256 has an on-chain operator today; sha256 lands with
      // the rawCall recipes (the SHA-256 precompile).
      const algorithm = await ctx.interpreters.interpretNode(node.args[1]);
      if (String(algorithm) !== "keccak256") {
        throw new ErrorException(
          `@hash! computes keccak256 on-chain; "${String(algorithm)}" is not supported at assertion time yet`,
        );
      }
    }
    const arg = await chainArgWithLens(ctx, "hash!", node.args[0]);
    requireBytesLike(arg, "hash!");
    return {
      kind: "call",
      param: hashParamOf(ctx, lensedDataOperand(ctx, arg)),
      cat: "Bytes32",
    };
  },
});
