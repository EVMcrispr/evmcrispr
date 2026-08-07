import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "bytelen!",
  description:
    "The raw byte length of the return data of a call, on-chain (a uint256[] with n items is 64 + n*32 bytes).",
  returnType: "number",
  args: [
    {
      name: "call",
      type: "any",
      description: "A `::` call expression (or chain) to measure",
    },
  ],
});
