import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@map",
  {
    module: "lang",
    cases: [
      {
        name: "should apply @str.upper to each element",
        input: `@map(["hello" "world"] @str.upper)`,
        validate(result) {
          expect(result).to.deep.equal(["HELLO", "WORLD"]);
        },
      },
      {
        name: "should apply @bool to each element",
        input: `@map([1 0 1] @bool)`,
        validate(result) {
          expect(result).to.deep.equal(["true", "false", "true"]);
        },
      },
      {
        name: "should return empty array for empty input",
        input: `@map([] @str.upper)`,
        validate(result) {
          expect(result).to.be.an("array").with.lengthOf(0);
        },
      },
    ],
    docCases: [
      {
        description: "Double each element",
        code: `def @double "$n: number -> number" @num($n * 2)\nset $nums [1 2 3]\nset $doubled @map($nums @double)`,
      },
    ],
    errorCases: [
      {
        name: "should fail when second argument is not a helper",
        input: `@map([1 2] "notAHelper")`,
        error: "must be a helper reference",
      },
    ],
    skipArgLengthCheck: true,
  },
  helpers.map.argDefs,
);
