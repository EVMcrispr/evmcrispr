import { defineHelper, ErrorException } from "@evmcrispr/sdk";
import { compileOperand, coreCall, encodeOk } from "@evmcrispr/sdk/onchain";
import type Assertions from "..";

export default defineHelper<Assertions>({
  name: "ok",
  description:
    "Whether a live call resolves without reverting, checked on-chain at assertion time: true when the call succeeds, false when it reverts.",
  returnType: "bool",
  args: [
    {
      name: "call",
      type: "address",
      description:
        "A `::` call expression (or chain, or on-chain helper) to probe",
    },
  ],
  compile: async (ctx, node) => {
    if (node.args.length !== 1) {
      throw new ErrorException(
        "@ok! expects a single call argument, e.g. @ok!($token::symbol())",
      );
    }
    const o = await compileOperand(ctx, node.args[0]);
    if (o.kind !== "call") {
      // A build-time constant cannot revert at assertion time — requiring
      // a live call keeps mistakes (quoted literals, misspelled vars)
      // from compiling into a vacuous `true`.
      throw new ErrorException(
        "@ok! needs a live call to probe, got a build-time constant",
      );
    }
    return coreCall(ctx, encodeOk(o.param), "Bool");
  },
});
