import "../../setup";
import { BindingsSpace, Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";

const target = "0x44fA8E6f47987339850636F88629646662444217";
const fnSig = "approve(address,uint256)";

describeCommand("loop", {
  describeName: "Std > commands > loop",
  docCases: [
    {
      description: "Iterate over an array",
      code: `set $items [1 2 3]\nloop $item of $items (\n  print $item\n)`,
    },
    {
      description: "Repeat until a condition is true",
      code: `set $i 0\nloop until @bool($i >= 3) (\n  print $i\n  set $i @num($i + 1)\n)`,
    },
  ],
  cases: [
    {
      name: "should iterate over an array producing actions per element",
      script: `
loop $i of @arr(0 3) (
  exec ${target} ${fnSig} ${target} 1e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(3);
      },
    },
    {
      name: "should not execute the block for an empty array",
      script: `
set $items []
loop $item of $items (
  exec ${target} ${fnSig} ${target} 1e18
)`,
      expectedActions: [],
    },
    {
      name: "should scope the loop variable to the block",
      script: `
loop $i of @arr(0 2) (
  print $i
)`,
      validate: (_actions, interpreter) => {
        const i = interpreter.getBinding("$i", BindingsSpace.USER);
        expect(i).to.be.undefined;
      },
    },
    {
      name: "should loop until the condition becomes true",
      script: `
set $i 0
loop until @bool($i >= 3) (
  set $i @num($i + 1)
)`,
      validate: (_actions, interpreter) => {
        const i = interpreter.getBinding("$i", BindingsSpace.USER);
        expect(i).to.be.instanceOf(Num);
        expect((i as Num).eq(Num(3n))).to.be.true;
      },
    },
    {
      name: "should not execute the block when the condition is immediately true",
      script: `
loop until true (
  exec ${target} ${fnSig} ${target} 1e18
)`,
      expectedActions: [],
    },
    {
      name: "should produce actions across until-loop iterations",
      script: `
set $i 0
loop until @bool($i >= 2) (
  exec ${target} ${fnSig} ${target} 1e18
  set $i @num($i + 1)
)`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
      },
    },
    {
      name: "should support nested loops",
      script: `
loop $i of @arr(0 2) (
  loop $j of @arr(0 2) (
    exec ${target} ${fnSig} ${target} 1e18
  )
)`,
      validate: (actions) => {
        expect(actions).to.have.length(4);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when the connector is not `of` or `until`",
      script: `
set $items [1 2 3]
loop $item in $items (
  print $item
)`,
      error: 'expected "of" or "until", got "in"',
    },
    {
      name: "should fail when the iteration form has no loop variable",
      script: `
set $items [1 2 3]
loop of $items (
  print $item
)`,
      error: "<variable> must be a $variable",
    },
    {
      name: "should fail when the until form has a loop variable",
      script: `
loop $i until true (
  print 1
)`,
      error: "until form takes no loop variable",
    },
    {
      name: "should fail when iterating a non-array value",
      script: `
loop $item of 42 (
  print $item
)`,
      error: "<value> must be an array",
    },
    {
      name: "should fail when the until condition is not a boolean",
      script: `
loop until 42 (
  print 1
)`,
      error: "<condition> must be a boolean",
    },
    {
      name: "should fail when the until form has an extra argument",
      script: `
loop until true extra (
  print 1
)`,
      error: "too many arguments",
    },
  ],
});
