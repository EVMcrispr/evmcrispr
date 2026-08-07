import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "split!",
  description:
    "Split the string return of a call on a delimiter and select one segment, on-chain. A negative index counts from the end (-1 = last segment).",
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
      description:
        "Segment index to select: zero-based from the start, negative from the end (-1 = last)",
    },
  ],
});
