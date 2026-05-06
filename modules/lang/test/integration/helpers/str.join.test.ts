import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.join",
  {
    module: "lang",
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
    docCases: [
      {
        description: "Join array with comma",
        code: `set $parts ["a" "b" "c"]\nset $csv @str.join($parts ",")`,
      },
      {
        description: "Join with space",
        code: `set $parts ["a" "b" "c"]\nset $spaced @str.join($parts " ")`,
      },
    ],
    sampleArgs: [`[1 2]`, `","`],
  },
  helpers["str.join"].argDefs,
);
