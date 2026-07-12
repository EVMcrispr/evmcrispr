import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.join",
  {
    module: "lang [@str.join]",
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
        code: `load lang [@str.join]\nset $parts ["a" "b" "c"]\nset $csv @str.join($parts ",")`,
        preamble: "",
      },
      {
        description: "Join with space",
        code: `load lang [@str.join]\nset $parts ["a" "b" "c"]\nset $spaced @str.join($parts " ")`,
        preamble: "",
      },
    ],
    sampleArgs: [`[1 2]`, `","`],
  },
  helpers["str.join"].argDefs,
);
