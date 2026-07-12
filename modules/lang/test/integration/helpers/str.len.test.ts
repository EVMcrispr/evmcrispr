import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@str.len",
  {
    module: "lang [@str.len]",
    cases: [
      {
        name: "should return the length of a string",
        input: `@str.len("hello")`,
        validate(result) {
          expect(result).to.be.instanceOf(Num);
          expect(result.eq(Num(5n))).to.be.true;
        },
      },
      {
        name: "should return 0 for an empty string",
        input: `@str.len("")`,
        validate(result) {
          expect(result.eq(Num(0n))).to.be.true;
        },
      },
    ],
    docCases: [
      {
        description: "Get string length",
        code: `load lang [@str.len]\nset $s "hello"\nprint @str.len($s)`,
        preamble: "",
      },
      { description: "Empty string length", code: `print @str.len("")` },
    ],
    sampleArgs: [`"a"`],
  },
  helpers["str.len"].argDefs,
);
