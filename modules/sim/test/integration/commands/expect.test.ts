import "../../setup";
import { describeCommand } from "@evmcrispr/test-utils";

describeCommand("expect", {
  describeName: "Sim > commands > expect <value> <operator> <expectedValue>",
  module: "sim",
  preamble: "load sim",
  cases: [
    {
      name: "should pass when values are equal (==)",
      script: "sim:expect 1 == 1",
      expectedActions: [],
    },
    {
      name: "should pass when values are not equal (!=)",
      script: "sim:expect 1 != 2",
      expectedActions: [],
    },
    {
      name: "should pass with greater-than (>)",
      script: "sim:expect 5 > 3",
      expectedActions: [],
    },
    {
      name: "should pass with greater-or-equal (>=)",
      script: "sim:expect 5 >= 5",
      expectedActions: [],
    },
    {
      name: "should pass with less-than (<)",
      script: "sim:expect 2 < 10",
      expectedActions: [],
    },
    {
      name: "should pass with less-or-equal (<=)",
      script: "sim:expect 7 <= 7",
      expectedActions: [],
    },
    {
      name: "should pass with string equality",
      script: 'sim:expect "hello" == "hello"',
      expectedActions: [],
    },
    {
      name: "should pass with string inequality",
      script: 'sim:expect "hello" != "world"',
      expectedActions: [],
    },
    {
      name: "should pass with variable references",
      script: 'set $a 42\nsim:expect $a == 42',
      expectedActions: [],
    },
  ],
  errorCases: [
    {
      name: "should fail when equality assertion does not hold",
      script: "sim:expect 1 == 2",
      error: "An assertion failed.",
    },
    {
      name: "should fail when inequality assertion does not hold",
      script: "sim:expect 1 != 1",
      error: "An assertion failed.",
    },
    {
      name: "should fail when > assertion does not hold",
      script: "sim:expect 2 > 5",
      error: "An assertion failed.",
    },
    {
      name: "should fail when >= assertion does not hold",
      script: "sim:expect 2 >= 5",
      error: "An assertion failed.",
    },
    {
      name: "should fail when < assertion does not hold",
      script: "sim:expect 10 < 3",
      error: "An assertion failed.",
    },
    {
      name: "should fail when <= assertion does not hold",
      script: "sim:expect 10 <= 3",
      error: "An assertion failed.",
    },
    {
      name: "should fail with an unrecognized operator",
      script: "sim:expect 1 ~~ 1",
      error: "not recognized",
    },
    {
      name: "should fail when comparing non-numeric values with >",
      script: 'sim:expect "a" > "b"',
      error: "must be used between two numbers",
    },
    {
      name: "should fail when comparing non-numeric values with >=",
      script: 'sim:expect "a" >= "b"',
      error: "must be used between two numbers",
    },
    {
      name: "should fail when comparing non-numeric values with <",
      script: 'sim:expect "a" < "b"',
      error: "must be used between two numbers",
    },
    {
      name: "should fail when comparing non-numeric values with <=",
      script: 'sim:expect "a" <= "b"',
      error: "must be used between two numbers",
    },
  ],
});
