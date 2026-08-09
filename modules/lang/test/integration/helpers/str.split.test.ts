import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.split",
  {
    module: "lang [@str.split]",
    cases: [
      {
        name: "should split a string by delimiter",
        input: `@str.split("a,b,c" ",")`,
        validate(result) {
          expect(result).to.deep.equal(["a", "b", "c"]);
        },
      },
      {
        name: "should split by space",
        input: `@str.split("hello world" " ")`,
        validate(result) {
          expect(result).to.deep.equal(["hello", "world"]);
        },
      },
      {
        name: "should return single-element array when delimiter not found",
        input: `@str.split("abc" ",")`,
        validate(result) {
          expect(result).to.deep.equal(["abc"]);
        },
      },
      {
        name: "should select a segment when an index is given",
        input: `@str.split("a,b,c" "," 1)`,
        expected: "b",
      },
      {
        name: "should select from the end with a negative index",
        input: `@str.split("a,b,c" "," -1)`,
        expected: "c",
      },
    ],
    errorCases: [
      {
        name: "should fail when the index is out of range",
        input: `@str.split("a,b,c" "," 3)`,
        error: "out of range",
      },
    ],
    docCases: [
      {
        description: "Split by comma",
        code: `load lang [@str.split]\nset $parts @str.split("a,b,c" ",")`,
        preamble: "",
      },
      {
        description: "Split by space",
        code: `load lang [@str.split]\nset $words @str.split("hello world" " ")`,
        preamble: "",
      },
    ],
    sampleArgs: [`"a,b,c"`, `","`, "1"],
  },
  helpers["str.split"].argDefs,
);
