import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.split", {
  cases: [
    {
      name: "should split a string by delimiter",
      input: `@str.split("a,b,c", ",")`,
      validate(result) {
        expect(result).to.deep.equal(["a", "b", "c"]);
      },
    },
    {
      name: "should split by space",
      input: `@str.split("hello world", " ")`,
      validate(result) {
        expect(result).to.deep.equal(["hello", "world"]);
      },
    },
    {
      name: "should return single-element array when delimiter not found",
      input: `@str.split("abc", ",")`,
      validate(result) {
        expect(result).to.deep.equal(["abc"]);
      },
    },
  ],
}, helpers["str.split"].argDefs);

describeHelper("@str.join", {
  cases: [
    {
      name: "should join an array with delimiter",
      input: `@str.join(["a", "b", "c"], ",")`,
      expected: "a,b,c",
    },
    {
      name: "should join with space",
      input: `@str.join(["hello", "world"], " ")`,
      expected: "hello world",
    },
    {
      name: "should join single-element array",
      input: `@str.join(["solo"], ",")`,
      expected: "solo",
    },
  ],
  sampleArgs: [`[1, 2]`, `","`],
}, helpers["str.join"].argDefs);

describeHelper("@str.upper", {
  cases: [
    {
      name: "should convert to uppercase",
      input: `@str.upper("hello")`,
      expected: "HELLO",
    },
    {
      name: "should handle already uppercase string",
      input: `@str.upper("ABC")`,
      expected: "ABC",
    },
    {
      name: "should handle mixed case",
      input: `@str.upper("Hello World")`,
      expected: "HELLO WORLD",
    },
  ],
}, helpers["str.upper"].argDefs);

describeHelper("@str.lower", {
  cases: [
    {
      name: "should convert to lowercase",
      input: `@str.lower("HELLO")`,
      expected: "hello",
    },
    {
      name: "should handle already lowercase string",
      input: `@str.lower("abc")`,
      expected: "abc",
    },
    {
      name: "should handle mixed case",
      input: `@str.lower("Hello World")`,
      expected: "hello world",
    },
  ],
}, helpers["str.lower"].argDefs);

describeHelper("@str.replace", {
  cases: [
    {
      name: "should replace a substring",
      input: `@str.replace("hello world", "world", "there")`,
      expected: "hello there",
    },
    {
      name: "should replace all occurrences",
      input: `@str.replace("aabaa", "a", "x")`,
      expected: "xxbxx",
    },
    {
      name: "should handle no match",
      input: `@str.replace("hello", "xyz", "abc")`,
      expected: "hello",
    },
  ],
}, helpers["str.replace"].argDefs);
