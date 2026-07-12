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
  },
  helpers["str.split"].argDefs,
);
