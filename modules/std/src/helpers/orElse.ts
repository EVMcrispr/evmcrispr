import {
  defineHelper,
  ErrorException,
  isChainFailure,
  type Node,
  NodeType,
} from "@evmcrispr/sdk";
import {
  branchCompatible,
  compileOperand,
  coreCall,
  encodeOrElse,
  materializeWord,
} from "@evmcrispr/sdk/onchain";
import type Std from "..";

/** The first branch has to be something that can fail — a constant cannot,
 *  so its fallback would be unreachable code that reads as a safety net. */
const PROBEABLE = new Set<string>([
  NodeType.CallExpression,
  NodeType.HelperFunctionExpression,
]);

export default defineHelper<Std>({
  name: "orElse",
  description:
    "The value of the first read, or the second one when the first reverts.",
  compileDescription:
    "Both branches must resolve to the same kind of value, and a constant fallback must fit in one word.",
  returnType: "any",
  args: [
    {
      name: "primary",
      type: "any",
      // Both branches arrive unevaluated: which one is worth resolving
      // depends on whether the other failed.
      lazy: true,
      description: "The read to try first — a `::` call, chain, or helper",
    },
    {
      name: "fallback",
      type: "any",
      lazy: true,
      description: "The value to use when the first read reverts",
    },
  ],
  async run(_module, { primary, fallback }, { interpreters }) {
    const first = primary as Node | undefined;
    const second = fallback as Node | undefined;
    if (!first || !second) {
      throw new ErrorException(
        "@orElse expects two branches, e.g. @orElse($vault::previewRedeem(1e18) $vault::convertToAssets(1e18))",
      );
    }
    if (!PROBEABLE.has(first.type)) {
      throw new ErrorException(
        "@orElse needs a live read as its first branch, got a build-time constant — a constant cannot fail, so the fallback would be unreachable",
      );
    }
    try {
      return await interpreters.interpretNode(first);
    } catch (err) {
      // A revert is the case this helper exists for. Anything else (no ABI,
      // unknown variable, unreachable node) is the script or the setup being
      // wrong, and silently taking the fallback would bury it.
      if (!isChainFailure(err)) throw err;
      return await interpreters.interpretNode(second);
    }
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 2) {
      throw new ErrorException(
        "@orElse! expects two branches, e.g. @orElse!($vault::{previewRedeem(uint256)(uint256) 1e18} $vault::{convertToAssets(uint256)(uint256) 1e18})",
      );
    }
    const first = await compileOperand(ctx, node.args[0]);
    if (first.kind !== "call") {
      throw new ErrorException(
        "@orElse! needs a live read as its first branch, got a build-time constant — a constant cannot revert, so the fallback would be unreachable",
      );
    }
    const second = await compileOperand(ctx, node.args[1]);
    if (!branchCompatible(first.cat, second.cat)) {
      throw new ErrorException(
        `@orElse! branches must resolve to the same kind of value, got ${first.cat} and ${second.cat} — the judge compares whichever one resolved`,
      );
    }
    if (
      second.kind === "const" &&
      (second.cat === "String" || second.cat === "Bytes")
    ) {
      // materializeWord encodes a constant as one raw word; a string or
      // bytes literal is not word-shaped, and the core splices words.
      throw new ErrorException(
        "@orElse! cannot use a string or bytes constant as its fallback — read it on-chain instead",
      );
    }
    return coreCall(
      ctx,
      encodeOrElse(first.param, materializeWord(ctx, second)),
      first.cat,
    );
  },
});
