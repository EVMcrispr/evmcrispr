import "../../setup";
import { BindingsSpace, toDecimals } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";

describeCommand("set", {
  describeName: "Std > commands > set <varName> <varValue>",
  cases: [
    {
      name: "should set a user variable correctly",
      script: "set $var 1e18",
      validate: (_, interpreter) => {
        expect(interpreter.getBinding("$var", BindingsSpace.USER)).to.be.equal(
          toDecimals(1, 18),
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
  ],
  errorCases: [
    {
      name: "should fail when setting an invalid variable identifier",
      script: "set var1 12e18",
      error: "<variable> must be a $variable",
    },
  ],
});
