import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "len!",
  description:
    "The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes.",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "any",
      description:
        "A `::` call expression (or chain) returning an array, string or bytes",
    },
  ],
});
