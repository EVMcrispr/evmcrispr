import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.slice", {
  cases: [
    {
      name: "should slice a string with start and end",
      input: `@str.slice("hello world" 0 5)`,
      expected: "hello",
    },
    {
      name: "should slice a string from start to end",
      input: `@str.slice("hello" 2)`,
      expected: "llo",
    },
    {
      name: "should support negative indices on strings",
      input: `@str.slice("hello" -3)`,
      expected: "llo",
    },
  ],
  sampleArgs: [`"a"`, `0`, `1`],
}, helpers["str.slice"].argDefs);
