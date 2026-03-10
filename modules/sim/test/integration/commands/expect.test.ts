import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils";

describeCommand("expect", {
  describeName: "Sim > commands > expect <condition>",
  module: "sim",
  preamble: "load sim",
  cases: [
    {
      name: "should pass when condition is true",
      script: "sim:expect true",
      expectedActions: [],
    },
    {
      name: "should pass with @bool equal (==)",
      script: "sim:expect @bool(1 == 1)",
      expectedActions: [],
    },
    {
      name: "should pass with @bool not-equal (!=)",
      script: "sim:expect @bool(1 != 2)",
      expectedActions: [],
    },
    {
      name: "should pass with @bool greater-than (>)",
      script: "sim:expect @bool(5 > 3)",
      expectedActions: [],
    },
    {
      name: "should pass with @bool greater-or-equal (>=)",
      script: "sim:expect @bool(5 >= 5)",
      expectedActions: [],
    },
    {
      name: "should pass with @bool less-than (<)",
      script: "sim:expect @bool(2 < 10)",
      expectedActions: [],
    },
    {
      name: "should pass with @bool less-or-equal (<=)",
      script: "sim:expect @bool(7 <= 7)",
      expectedActions: [],
    },
    {
      name: "should pass with @bool string equality",
      script: 'sim:expect @bool("hello" == "hello")',
      expectedActions: [],
    },
    {
      name: "should pass with variable references",
      script: "set $a 42\nsim:expect @bool($a == 42)",
      expectedActions: [],
    },
  ],
  errorCases: [
    {
      name: "should fail when condition is false",
      script: "sim:expect false",
      error: "An assertion failed.",
    },
    {
      name: "should fail when @bool equality does not hold",
      script: "sim:expect @bool(1 == 2)",
      error: "An assertion failed.",
    },
    {
      name: "should fail when @bool > does not hold",
      script: "sim:expect @bool(2 > 5)",
      error: "An assertion failed.",
    },
  ],
});
