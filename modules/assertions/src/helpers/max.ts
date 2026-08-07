import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "max!",
  description:
    "Maximum of two or more values, computed on-chain at assertion time.",
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
});
