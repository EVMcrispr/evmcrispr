import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "charset!",
  description:
    "Whether every byte of the string return of a call is in a character class, checked on-chain — only-lowercase is @charset!(call `a-z`).",
  returnType: "bool",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) returning a string",
    },
    {
      name: "class",
      type: "string",
      description:
        "Allowed characters and ranges, e.g. `a-z0-9-` (a leading or trailing dash is the literal `-`)",
    },
  ],
});
