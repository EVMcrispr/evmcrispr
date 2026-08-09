import { compileExpr } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "bool!",
  description:
    "Compose live comparisons with on-chain logic (and, or, xor, not), evaluated at assertion time via the operators contract.",
  returnType: "bool",
  args: [
    {
      // Stays "any": bool expressions legitimately embed number-, string- and
      // bytes32-returning helpers as comparison operands, so any narrower type
      // would either hide valid helpers or (with "string") disable filtering.
      name: "expression",
      type: "any",
      rest: true,
      optional: true,
      description:
        "Comparisons and word logic operators over `::` calls, on-chain helpers and constants",
    },
  ],
  // Syntax entry point into the expression engine, which stays central: the
  // shunting-yard over raw nodes is shared with @num! and the assert command.
  compileAssert: (ctx, node) => compileExpr(ctx, node.args, "bool"),
});
