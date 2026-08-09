import { compileExpr } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "num!",
  description:
    "Compose live calls and constants with on-chain arithmetic (+ - * / % ^, xor), evaluated at assertion time via the operators contract.",
  returnType: "number",
  args: [
    {
      name: "expression",
      type: "number",
      rest: true,
      optional: true,
      description:
        "Infix arithmetic over `::` calls, on-chain helpers and constants",
    },
  ],
  // Syntax entry point into the expression engine, which stays central: the
  // shunting-yard over raw nodes is shared with @bool! and the assert command.
  compileAssert: (ctx, node) => compileExpr(ctx, node.args, "num"),
});
