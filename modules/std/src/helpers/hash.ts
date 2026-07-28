import { defineHelper, ErrorInvalid, fieldItem } from "@evmcrispr/sdk";
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
});
