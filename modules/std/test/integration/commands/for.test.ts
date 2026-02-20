import "../../setup";
import { BindingsSpace, encodeAction } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";

const target = "0x44fA8E6f47987339850636F88629646662444217";
const fnSig = "approve(address,uint256)";

describeCommand("for", {
  describeName: "Std > commands > for <$var> of <array> (...)",
  cases: [
    {
      name: "should iterate over an array and produce actions for each element",
      script: `
set $addresses [0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6, 0x8790B75CF2bd36A2502a3e48A24338D8288f2F15]
for $addr of $addresses (
  exec ${target} ${fnSig} $addr 100e18
)`,
      validate: (actions) => {
        expect(actions).to.have.length(2);
      },
    },
    {
      name: "should not leak the loop variable outside the for scope",
      script: `
set $items [1, 2, 3]
for $item of $items (
  print $item
)`,
      validate: (_, interpreter) => {
        expect(() =>
          interpreter.getBinding("$item", BindingsSpace.USER),
        ).to.throw;
      },
    },
    {
      name: "should produce no actions for an empty array",
      script: `
set $empty []
for $x of $empty (
  exec ${target} ${fnSig} ${target} 1e18
)`,
      expectedActions: [],
    },
  ],
  errorCases: [
    {
      name: 'should fail when the connector is not "of"',
      script: `
set $arr [1, 2]
for $x in $arr (
  print $x
)`,
      error: 'expected "of"',
    },
  ],
});
