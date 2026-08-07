import { compileExpr } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "bool!",
  description:
    "Compose live comparisons with on-chain logic (and, or, xor, not), evaluated at assertion time via the combinators contract.",
  returnType: "bool",
  args: [
    {
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
