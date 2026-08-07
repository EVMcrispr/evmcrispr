import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "timestamp!",
  description:
    "The block timestamp at assertion time (not at script build time).",
  returnType: "number",
  args: [],
});
