import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@str.slice", {
  module: "lang",
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
  docCases: [
    { description: "Slice a prefix", code: `set $s "hello world"\nset $hello @str.slice($s 0 5)` },
    { description: "Slice from offset to end", code: `set $s "hello world"\nset $world @str.slice($s 6)` },
    { description: "Negative index slice", code: `set $s "hello world"\nset $last3 @str.slice($s -3)` },
  ],
  sampleArgs: [`"a"`, `0`, `1`],
}, helpers["str.slice"].argDefs);
