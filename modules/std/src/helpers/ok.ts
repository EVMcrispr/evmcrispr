import {
  defineHelper,
  ErrorException,
  isChainFailure,
  type Node,
  NodeType,
} from "@evmcrispr/sdk";
import { compileOperand, coreCall, encodeOk } from "@evmcrispr/sdk/onchain";
import type Std from "..";

/** A build-time constant cannot fail the way a read can, so probing one is
 *  always a mistake: `@ok("0x…")` or `@ok($addr)` would answer `true` for
 *  a quoted literal or a misspelled variable and hide the error it was
 *  written to catch. Both faces require something that actually reads. */
const PROBEABLE = new Set<string>([
  NodeType.CallExpression,
  NodeType.HelperFunctionExpression,
]);

export default defineHelper<Std>({
  name: "ok",
  description:
    "Whether a live call resolves without reverting: true when the call succeeds, false when it reverts.",
  returnType: "bool",
  args: [
    {
      name: "call",
      type: "address",
      // The framework would resolve this before the helper ran, and the
      // resolution failing IS the answer — so the node arrives unevaluated.
      lazy: true,
      description:
        "A `::` call expression (or chain, or on-chain helper) to probe",
    },
  ],
  async run(_module, { call }, { interpreters }) {
    const node = call as Node | undefined;
    if (!node) {
      throw new ErrorException(
        "@ok expects a single call argument, e.g. @ok($token::symbol())",
      );
    }
    if (!PROBEABLE.has(node.type)) {
      throw new ErrorException(
        "@ok needs a live call to probe, got a build-time constant",
      );
    }
    try {
      await interpreters.interpretNode(node);
      return true;
    } catch (err) {
      // Only the chain refusing the read answers `false`. A missing ABI, an
      // unknown variable or an unreachable node are the script or the setup
      // being wrong, and reporting those as "the call reverted" would be a
      // wrong answer dressed as a measurement.
      if (isChainFailure(err)) return false;
      throw err;
    }
  },
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@ok! expects a single call argument, e.g. @ok!($token::symbol())",
      );
    }
    const o = await compileOperand(ctx, node.args[0]);
    if (o.kind !== "call") {
      throw new ErrorException(
        "@ok! needs a live call to probe, got a build-time constant",
      );
    }
    return coreCall(ctx, encodeOk(o.param), "Bool");
  },
});
