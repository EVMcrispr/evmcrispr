import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";
import { USDC, USDCX } from "../../fixtures";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");

const preamble = `load assertions\nload superfluid\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (superfluid on-chain faces)", {
  describeName: "Superfluid > helpers > on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @underlying! to a direct getUnderlyingToken() staticcall",
      script: `assertions:assert @underlying!(${USDCX}) == ${USDC} "underlying changed"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(getAddress(USDCX));
        expect(call.data).to.equal(selectorOf("getUnderlyingToken()"));
        d.expectConstraint(param, "Eq", BigInt(getAddress(USDC)));
      },
    },
    {
      name: "folds @token! to the composition-time list resolution",
      script: `assertions:assert @underlying!(@superfluid:token!(USDCx)) == ${USDC}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // @token! folded to the SuperToken address at composition time;
        // the assertion carries only the live underlying read.
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(getAddress(USDCX));
        expect(call.data).to.equal(selectorOf("getUnderlyingToken()"));
      },
    },
  ],
});
