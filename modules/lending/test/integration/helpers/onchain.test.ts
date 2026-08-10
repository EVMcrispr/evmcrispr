import "../../setup";
import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";
import { AAVE_POOL, SOME_ADDRESS, WXDAI } from "../../fixtures";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);

const preamble = `load lending`;

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
      script: `assert @lending:apy!(${WXDAI} supply) > 0.01`,
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
      script: `assert @lending:apy!(${WXDAI} borrow) > 0.01`,
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
      script: `assert @lending:apy!(${WXDAI} supply) >= 0.05`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // The result is ray-scaled, so 5% travels as 5e25 — truncating it
        // to the integer 0 would make the assertion vacuous.
        d.expectConstraint(param, "Gte", 5n * 10n ** 25n);
      },
    },
    {
      name: "picks the health factor out of the account data, wad-scaled",
      script: `assert @lending:healthFactor!(${SOME_ADDRESS}) >= 1.5`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const pick = d.core(param);
        expect(pick.functionName).to.equal("pick");
        // getUserAccountData returns six words; the health factor is last.
        expect(pick.args[1]).to.equal(5n);
        const call = d.staticCallOf(pick.args[0] as never);
        expect(call.target).to.equal(getAddress(AAVE_POOL));
        expect(call.data.startsWith(selectorOf("getUserAccountData(address)")))
          .to.be.true;
        // Wad-scaled, so 1.5 travels as 1.5e18 rather than rounding to 2.
        d.expectConstraint(param, "Gte", 15n * 10n ** 17n);
      },
    },
    {
      name: "reads debt off the address the reserve struct holds",
      script: `assert @lending:debt!(${SOME_ADDRESS} ${WXDAI}) == 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // read(target, balanceOf, [account]) where the target is itself a
        // pick of word 10 — the variable debt token — off the reserve.
        const { target, selector, segments } = d.readOf(param);
        expect(selector).to.equal(selectorOf("balanceOf(address)"));
        expect(segments).to.have.lengthOf(1);
        d.expectRawWord(segments[0], BigInt(getAddress(SOME_ADDRESS)));

        const pick = d.core(target);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(10n);
        const reserve = d.staticCallOf(pick.args[0] as never);
        expect(reserve.target).to.equal(getAddress(AAVE_POOL));
        expect(reserve.data.startsWith(selectorOf("getReserveData(address)")))
          .to.be.true;
      },
    },
  ],
  errorCases: [
    {
      name: "still rejects an unlisted reserve at composition time",
      script: `assert @lending:apy!(${SOME_ADDRESS} supply) > 0`,
      error: "not listed on AaveV3",
    },
    {
      name: "rejects a side other than supply or borrow",
      script: `assert @lending:apy!(${WXDAI} sideways) > 0`,
      error: "must be `supply` or `borrow`",
    },
  ],
});
