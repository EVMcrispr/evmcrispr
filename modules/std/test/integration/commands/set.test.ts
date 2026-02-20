import "../../setup";
import { BindingsSpace } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";
import { parseUnits } from "viem";

describeCommand("set", {
  describeName: "Std > commands > set <varName> <varValue>",
  cases: [
    {
      name: "should set a user variable correctly",
      script: "set $var 1e18",
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$var", BindingsSpace.USER)).to.be.equal(
          parseUnits("1", 18),
        );
      },
    },
    {
      name: "should update the value when setting an already-defined variable",
      script: 'set $var1 12e18\nset $var1 "new"',
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$var1", BindingsSpace.USER)).to.be.equal(
          "new",
        );
      },
    },
    {
      name: "should set a string variable",
      script: 'set $greeting "hello world"',
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$greeting", BindingsSpace.USER),
        ).to.be.equal("hello world");
      },
    },
    {
      name: "should set a boolean variable",
      script: "set $flag true",
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$flag", BindingsSpace.USER),
        ).to.be.equal(true);
      },
    },
    {
      name: "should set a variable to an address",
      script: "set $addr 0x44fA8E6f47987339850636F88629646662444217",
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$addr", BindingsSpace.USER),
        ).to.be.equal("0x44fA8E6f47987339850636F88629646662444217");
      },
    },
    {
      name: "should set a variable from a helper expression",
      script: "set $dai @token(DAI)",
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$dai", BindingsSpace.USER),
        ).to.be.equal("0x44fA8E6f47987339850636F88629646662444217");
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when setting an invalid variable identifier",
      script: "set var1 12e18",
      error: "<variable> must be a $variable",
    },
  ],
});
