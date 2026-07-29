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
    {
      description: "Exit a loop early with loop break",
      code: `loop $i of @arr(0 10) (\n  if @bool($i >= 3) (\n    loop break\n  )\n  print $i\n)`,
    },
    {
      description: "Skip to the next iteration with loop continue",
      code: `loop $i of [1 2 3 4] (\n  if @bool($i == 2 or $i == 4) (\n    loop continue\n  )\n  print $i\n)`,
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
    {
      name: "should break out of an iteration loop",
      script: `
loop $i of @arr(0 10) (
  if @bool($i >= 3) (
    loop break
  )
  exec ${target} ${fnSig} ${target} 1e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(3);
      },
    },
    {
      name: "should break out of an until loop",
      script: `
set $i 0
loop until @bool($i >= 100) (
  if @bool($i >= 2) (
    loop break
  )
  exec ${target} ${fnSig} ${target} 1e18
  set $i @num($i + 1)
)`,
      validate: (actions, interpreter) => {
        expect(actions).to.have.length(2);
        const i = interpreter.getBinding("$i", BindingsSpace.USER);
        expect((i as Num).eq(Num(2n))).to.be.true;
      },
    },
    {
      name: "should continue to the next iteration",
      script: `
loop $i of @arr(0 4) (
  if @bool($i == 1 or $i == 2) (
    loop continue
  )
  exec ${target} ${fnSig} ${target} 1e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
      },
    },
    {
      name: "should break only the nearest enclosing loop",
      script: `
loop $i of @arr(0 2) (
  loop $j of @arr(0 5) (
    if @bool($j >= 1) (
      loop break
    )
    exec ${target} ${fnSig} ${target} 1e18
  )
)`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when the connector is not a known keyword",
      script: `
set $items [1 2 3]
loop $item in $items (
  print $item
)`,
      error: 'expected "of", "until", "break" or "continue", got "in"',
    },
    {
      name: "should fail on loop break outside a loop",
      script: "loop break",
      error: '"loop break" can only be used inside a loop block',
    },
    {
      name: "should fail on loop continue outside a loop",
      script: "loop continue",
      error: '"loop continue" can only be used inside a loop block',
    },
    {
      name: "should fail when loop break has extra arguments",
      script: `
loop $i of [1 2] (
  loop break now
)`,
      error: '"loop break" takes no arguments',
    },
    {
      name: "should not let a break escape a def body into the caller's loop",
      script: `
def leaky "" (
  loop break
)
loop $i of [1 2] (
  leaky
)`,
      error: '"loop break" can only be used inside a loop block',
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
