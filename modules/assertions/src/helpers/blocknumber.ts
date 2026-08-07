import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "blocknumber!",
  description: "The block number at assertion time (not at script build time).",
  returnType: "number",
  args: [],
});
