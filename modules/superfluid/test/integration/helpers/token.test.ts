import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { SOME_ADDRESS, USDC, USDCX, XDAIX } from "../../fixtures";

describeHelper("@superfluid:token", {
  module: "superfluid",
  cases: [
    {
      name: "resolves a SuperToken symbol",
      input: `@superfluid:token(xDAIx)`,
      validate: (result) => {
        expect(String(result).toLowerCase()).to.eq(XDAIX.toLowerCase());
      },
    },
    {
      name: "resolves the SuperToken wrapping an underlying address",
      input: `@superfluid:token(${USDC})`,
      validate: (result) => {
        expect(String(result).toLowerCase()).to.eq(USDCX.toLowerCase());
      },
    },
  ],
  errorCases: [
    {
      name: "should fail on unknown symbols",
      input: `@superfluid:token(NOTATOKEN)`,
      error: "not found",
    },
    {
      name: "should fail on addresses with no SuperToken wrapper",
      input: `@superfluid:token(${SOME_ADDRESS})`,
      error: "no SuperToken wrapping",
    },
  ],
  docCases: [
    {
      description: "Resolve USDCx from the USDC address and print both",
      code: `set $usdcx @superfluid:token(0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83)
print "USDCx:" $usdcx`,
    },
  ],
});
