import "../../setup";
import { Num } from "@evmcrispr/sdk";
import { describeHelper, expect } from "@evmcrispr/test-utils";
import { helpers } from "../../../src/_generated";

const testAddr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describeHelper(
  "@nonce",
  {
    cases: [
      {
        name: "should return the nonce for an address",
        input: `@nonce(${testAddr})`,
        validate: (result) => {
          const n =
            result instanceof Num ? result.toBigInt() : BigInt(String(result));
          expect(n).to.be.a("bigint");
          expect(n).to.be.greaterThanOrEqual(0n as unknown as number);
        },
      },
    ],
    docCases: [
      {
        description: "Get the nonce of an address",
        code: `set $n @nonce(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)\nprint $n`,
      },
    ],
  },
  helpers.nonce.argDefs,
);
