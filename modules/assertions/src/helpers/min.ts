import { arithCombine, variadicOperands } from "../lib/compiler";
import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "min!",
  description:
    "Minimum of two or more values, computed on-chain at assertion time.",
  returnType: "number",
  args: [
    {
      name: "values",
      type: "any",
      rest: true,
      optional: true,
      description: "Two or more numeric operands (or one array of them)",
    },
  ],
  compileAssert: async (ctx, node) => {
    const operands = await variadicOperands(ctx, node, "min!");
    return operands.reduce((acc, o) => arithCombine(ctx, "Min", acc, o));
  },
});
