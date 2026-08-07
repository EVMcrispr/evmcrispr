import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "num!",
  description:
    "Compose live calls and constants with on-chain arithmetic (+ - * / % ^, xor), evaluated at assertion time via the combinators contract.",
  returnType: "number",
  args: [
    {
      name: "expression",
      type: "any",
      rest: true,
      optional: true,
      description:
        "Infix arithmetic over `::` calls, on-chain helpers and constants",
    },
  ],
});
