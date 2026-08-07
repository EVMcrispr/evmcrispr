import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "at!",
  description:
    "Extract a raw 32-byte word from the return data of a call by word index, on-chain. Static layouts only — dynamic types contribute head offsets, not values.",
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
      description: "Zero-based 32-byte word index into the raw return data",
    },
  ],
});
