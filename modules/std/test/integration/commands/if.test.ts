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
  ],
});
