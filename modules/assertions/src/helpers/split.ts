import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "split!",
  description:
    "Split the string return of a call on a delimiter and select one segment, on-chain. Compare the result at the top level of an assertion.",
  returnType: "string",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) returning a string",
    },
    {
      name: "delimiter",
      type: "string",
      description: "Exact, non-empty byte sequence to split on",
    },
    {
      name: "index",
      type: "number",
      description: "Zero-based segment index to select",
    },
  ],
});
