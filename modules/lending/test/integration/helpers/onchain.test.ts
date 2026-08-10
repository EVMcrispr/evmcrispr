import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";
import { AAVE_POOL, SOME_ADDRESS, WXDAI } from "../../fixtures";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");

const preamble = `load assertions\nload lending\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

const SECONDS_PER_YEAR = 31536000n;
const RAY = 10n ** 27n;

describeCommand("assert (lending on-chain faces)", {
  describeName: "Lending > helpers > apy on-chain face",
  preamble,
  cases: [
    {
      name: "compounds the supply rate on-chain, in ray",
      script: `assertions:assert @lending:apy!(${WXDAI} supply) > 0.01`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // APY is growth minus principal: sub(rpow(...), 1 ray).
        const sub = d.opReadOf(param, "sub(uint256,uint256)");
        expect(sub).to.have.lengthOf(2);
        d.expectRawWord(sub[1], RAY);

        const pow = d.opReadOf(sub[0], "rpow(uint256,uint256,uint256)");
        expect(pow).to.have.lengthOf(3);
        d.expectRawWord(pow[1], SECONDS_PER_YEAR);
        // Compounded at the protocol's own unit.
        d.expectRawWord(pow[2], RAY);

        // One ray plus the per-second rate.
        const add = d.opReadOf(pow[0], "add(uint256,uint256)");
        d.expectRawWord(add[0], RAY);
        const perSecond = d.opReadOf(add[1], "div(uint256,uint256)");
        d.expectRawWord(perSecond[1], SECONDS_PER_YEAR);

        // The rate itself: word 2 of the reserve struct, read live.
        const pick = d.core(perSecond[0]);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        const call = d.staticCallOf(pick.args[0] as never);
        expect(call.target).to.equal(getAddress(AAVE_POOL));
        expect(call.data.startsWith(selectorOf("getReserveData(address)"))).to
          .be.true;
      },
    },
    {
      name: "picks the variable borrow rate for the borrow side",
      script: `assertions:assert @lending:apy!(${WXDAI} borrow) > 0.01`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const sub = d.opReadOf(param, "sub(uint256,uint256)");
        const pow = d.opReadOf(sub[0], "rpow(uint256,uint256,uint256)");
        const add = d.opReadOf(pow[0], "add(uint256,uint256)");
        const perSecond = d.opReadOf(add[1], "div(uint256,uint256)");
        const pick = d.core(perSecond[0]);
        expect(pick.functionName).to.equal("pick");
        // currentVariableBorrowRate rather than currentLiquidityRate.
        expect(pick.args[1]).to.equal(4n);
      },
    },
    {
      name: "scales the bound to ray instead of rounding it away",
      script: `assertions:assert @lending:apy!(${WXDAI} supply) >= 0.05`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // The result is ray-scaled, so 5% travels as 5e25 — truncating it
        // to the integer 0 would make the assertion vacuous.
        d.expectConstraint(param, "Gte", 5n * 10n ** 25n);
      },
    },
  ],
  errorCases: [
    {
      name: "still rejects an unlisted reserve at composition time",
      script: `assertions:assert @lending:apy!(${SOME_ADDRESS} supply) > 0`,
      error: "not listed on AaveV3",
    },
    {
      name: "rejects a side other than supply or borrow",
      script: `assertions:assert @lending:apy!(${WXDAI} sideways) > 0`,
      error: "must be `supply` or `borrow`",
    },
  ],
});
