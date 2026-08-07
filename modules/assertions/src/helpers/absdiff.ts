import { defineBangHelper } from "./_bang";

export default defineBangHelper({
  name: "absdiff!",
  description:
    "Absolute difference |a - b| computed on-chain — never underflows; `@absdiff!(a b) <= d` is the composable approximate-equality.",
  returnType: "number",
  args: [
    { name: "a", type: "any", description: "First numeric operand" },
    { name: "b", type: "any", description: "Second numeric operand" },
  ],
});
