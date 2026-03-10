import "../../setup";
import { describeCommand, expect } from "@evmcrispr/test-utils";

const target = "0x44fA8E6f47987339850636F88629646662444217";
const fnSig = "approve(address,uint256)";

describeCommand("if", {
  describeName: "Std > commands > if <condition> (...)",
  cases: [
    {
      name: "should execute the block when condition is truthy (boolean true)",
      script: `
if true (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should not execute the block when condition is falsy (boolean false)",
      script: `
if false (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      expectedActions: [],
    },
    {
      name: "should work with a variable condition",
      script: `
set $flag true
if $flag (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should execute block when @bool returns true",
      script: `
if @bool(1 == 1) (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should skip block when @bool returns false",
      script: `
if @bool(1 > 2) (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      expectedActions: [],
    },
    {
      name: "should work with @and and @bool",
      script: `
set $a 10
set $b 5
if @and(@bool($a > 0) @bool($b < 100)) (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should work with @not",
      script: `
if @not(false) (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should execute the then block when condition is true (if/else)",
      script: `
if true (
  exec ${target} ${fnSig} ${target} 100e18
) (
  exec ${target} ${fnSig} ${target} 200e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should execute the else block when condition is false (if/else)",
      script: `
if false (
  exec ${target} ${fnSig} ${target} 100e18
  exec ${target} ${fnSig} ${target} 100e18
) (
  exec ${target} ${fnSig} ${target} 200e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(1);
      },
    },
    {
      name: "should return no actions when condition is false and no else block",
      script: `
if false (
  exec ${target} ${fnSig} ${target} 100e18
)`,
      expectedActions: [],
    },
  ],
});
