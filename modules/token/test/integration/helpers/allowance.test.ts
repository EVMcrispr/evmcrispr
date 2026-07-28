import "../../setup";
import { describeHelper } from "@evmcrispr/test-utils/evml";
import { helpers } from "../../../src/_generated";

describeHelper(
  "@token:allowance",
  {
    module: "token",
    cases: [
      {
        name: "should return the allowance granted by an owner to a spender",
        input: "@token:allowance(DAI @token(DAI) @token(DAI))",
        expected: "0",
      },
    ],
    docCases: [
      {
        description: "Query an allowance",
        code: `set $allowance @token:allowance(DAI @me 0x4F2083f5fBede34C2714aFfb3105539775f7FE64)`,
      },
      {
        description: "Top up an allowance only when it is too low",
        code: `set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
if @bool(@token:allowance(DAI @me $spender) < @token:amount(DAI 100)) (
  token:approve @token:amount(DAI 100) @token(DAI) for $spender
)`,
      },
    ],
    errorCases: [
      {
        name: "should fail for the native token",
        input: "@token:allowance(XDAI @me @me)",
        error: "native token has no allowances",
      },
    ],
    sampleArgs: ["DAI", "@token(DAI)", "@token(DAI)"],
  },
  helpers.allowance.argDefs,
);
