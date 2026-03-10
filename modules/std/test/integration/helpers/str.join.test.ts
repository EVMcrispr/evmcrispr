import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.join", {
  cases: [
    {
      name: "should join an array with delimiter",
      input: `@str.join(["a" "b" "c"] ",")`,
      expected: "a,b,c",
    },
    {
      name: "should join with space",
      input: `@str.join(["hello" "world"] " ")`,
      expected: "hello world",
    },
    {
      name: "should join single-element array",
      input: `@str.join(["solo"] ",")`,
      expected: "solo",
    },
  ],
  sampleArgs: [`[1 2]`, `","`],
}, helpers["str.join"].argDefs);
