import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "includes!",
  description:
    "Whether the string return of a call contains a substring, checked on-chain — exact byte sequence, case-sensitive, no wildcards.",
  returnType: "bool",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) returning a string",
    },
    {
      name: "part",
      type: "string",
      description: "Non-empty byte sequence to search for",
    },
  ],
});
