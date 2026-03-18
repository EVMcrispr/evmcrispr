import "../../setup";
import { BindingsSpace, Num } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";

describeCommand("set", {
  describeName: "Std > commands > set <varName> <varValue>",
  cases: [
    {
      name: "should set a user variable correctly",
      script: "set $var 1e18",
      validate: (_, interpreter) => {
        const val = interpreter.getBinding("$var", BindingsSpace.USER);
        expect(val).to.be.instanceOf(Num);
        expect((val as Num).eq(Num(10n ** 18n, 1n))).to.be.true;
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
        expect(interpreter.getBinding("$flag", BindingsSpace.USER)).to.be.equal(
          true,
        );
      },
    },
    {
      name: "should set a variable to an address",
      script: "set $addr 0x44fA8E6f47987339850636F88629646662444217",
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$addr", BindingsSpace.USER)).to.be.equal(
          "0x44fA8E6f47987339850636F88629646662444217",
        );
      },
    },
    {
      name: "should set a variable from a helper expression",
      script: "set $dai @token(DAI)",
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$dai", BindingsSpace.USER)).to.be.equal(
          "0x44fA8E6f47987339850636F88629646662444217",
        );
      },
    },
    {
      name: "should destructure an array into variables",
      script: 'set [$a $b] ["hello" "world"]',
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$a", BindingsSpace.USER),
        ).to.be.equal("hello");
        expect(
          interpreter.getBinding("$b", BindingsSpace.USER),
        ).to.be.equal("world");
      },
    },
    {
      name: "should destructure with a leading hole",
      script: 'set [_ $b] ["skip" "keep"]',
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$b", BindingsSpace.USER),
        ).to.be.equal("keep");
      },
    },
    {
      name: "should destructure with nested patterns",
      script: 'set [$a [_ $b]] ["x" ["skip" "y"]]',
      validate: (_, interpreter) => {
        expect(
          interpreter.getBinding("$a", BindingsSpace.USER),
        ).to.be.equal("x");
        expect(
          interpreter.getBinding("$b", BindingsSpace.USER),
        ).to.be.equal("y");
      },
    },
  ],
  docCases: [
    {
      description: "Set a simple value",
      code: `set $amount 1e18`,
    },
    {
      description: "Set a string",
      code: `set $greeting "hello world"`,
    },
    {
      description: "Set from a helper result",
      code: `set $dai @token(DAI)`,
    },
    {
      description: "Destructuring assignment",
      code: `set [$a $b] ["hello" "world"]`,
    },
    {
      description: "Skip values with _",
      code: `set [_ $second] ["skip" "keep"]`,
    },
    {
      description: "Nested destructuring",
      code: `set [$a [_ $b]] ["x" ["skip" "y"]]`,
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
