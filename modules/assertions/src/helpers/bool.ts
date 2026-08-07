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
});
