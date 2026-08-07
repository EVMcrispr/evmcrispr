import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "at!",
  description:
    "Extract a raw 32-byte word from the return data of a call by word index, on-chain. A negative index counts from the end (-1 = last word, e.g. the last element of a single dynamic array return).",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) to read",
    },
    {
      name: "index",
      type: "number",
      description:
        "32-byte word index into the raw return data: zero-based from the start, negative from the end (-1 = last)",
    },
  ],
});
