import "../../setup";
import { BindingsSpace, Num } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";

const target = "0x44fA8E6f47987339850636F88629646662444217";
const fnSig = "approve(address,uint256)";

describeCommand("while", {
  describeName: "Std > commands > while <expression> (...)",
  docCases: [
    {
      description: "Countdown loop",
      code: `set $i 3\nwhile @bool($i > 0) (\n  print $i\n  set $i @num($i - 1)\n)`,
    },
  ],
  cases: [
    {
      name: "should loop a fixed number of times using a counter",
      script: `
set $i 0
while @bool($i < 3) (
  set $i @num($i + 1)
)`,
      validate: (_actions, interpreter) => {
        const i = interpreter.getBinding("$i", BindingsSpace.USER);
        expect(i).to.be.instanceOf(Num);
        expect((i as Num).eq(Num(3n))).to.be.true;
      },
    },
    {
      name: "should not execute body when condition is immediately false",
      script: `
while false (
  exec ${target} ${fnSig} ${target} 1e18
)`,
      expectedActions: [],
    },
    {
      name: "should produce actions inside the loop",
      script: `
set $i 0
while @bool($i < 2) (
  exec ${target} ${fnSig} ${target} 1e18
  set $i @num($i + 1)
)`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
      },
    },
  ],
});
