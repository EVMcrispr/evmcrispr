import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "hash!",
  description:
    "keccak256 of the raw return data of a call, computed on-chain — compare structs, arrays or long strings against a precomputed hash.",
  returnType: "bytes32",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) to hash",
    },
  ],
});
