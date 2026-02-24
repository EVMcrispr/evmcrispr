import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

describeHelper("@and", {
  cases: [
    {
      name: "should return true when both are true",
      input: "@and(true, true)",
      expected: "true",
    },
    {
      name: "should return false when first is false",
      input: "@and(false, true)",
      expected: "false",
    },
    {
      name: "should return false when second is false",
      input: "@and(true, false)",
      expected: "false",
    },
    {
      name: "should return false when both are false",
      input: "@and(false, false)",
      expected: "false",
    },
    {
      name: "should work with nested @bool calls",
      input: "@and(@bool(1, ==, 1), @bool(2, >, 1))",
      expected: "true",
    },
  ],
}, helpers.and.argDefs);

describeHelper("@or", {
  cases: [
    {
      name: "should return true when both are true",
      input: "@or(true, true)",
      expected: "true",
    },
    {
      name: "should return true when first is true",
      input: "@or(true, false)",
      expected: "true",
    },
    {
      name: "should return true when second is true",
      input: "@or(false, true)",
      expected: "true",
    },
    {
      name: "should return false when both are false",
      input: "@or(false, false)",
      expected: "false",
    },
  ],
}, helpers.or.argDefs);

describeHelper("@not", {
  cases: [
    {
      name: "should return false for true",
      input: "@not(true)",
      expected: "false",
    },
    {
      name: "should return true for false",
      input: "@not(false)",
      expected: "true",
    },
    {
      name: "should work with nested @bool",
      input: "@not(@bool(1, ==, 2))",
      expected: "true",
    },
  ],
}, helpers.not.argDefs);
