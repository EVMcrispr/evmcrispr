import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import type { DecodedParam } from "@evmcrispr/test-utils/evml";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";
import {
  CFA_FORWARDER,
  GDA_FORWARDER,
  RATE_1000_PER_MONTH,
  RECEIVER,
  SOME_ADDRESS,
  USDC,
  USDCX,
} from "../../fixtures";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");

/** A GDA pool is a composition-time staticcall TARGET, never called while
 *  the expression is built, so any address exercises the encoding. */
const POOL = getAddress("0x1111111111111111111111111111111111111111");

const preamble = `load assertions\nload superfluid\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

const args = (...values: bigint[]) =>
  values.map((v) => word(v).slice(2)).join("");

/**
 * Every flow rate and real-time balance is signed, and ERC-8211's inline
 * constraints compare unsigned words, so an ordering comparison over one
 * lowers to the int256 overload on the Operators contract, judged EQ 1.
 * Returns the left operand — the read itself.
 */
function signedCmp(param: DecodedParam, fn: string, rhs: bigint) {
  const { a, b } = d.expectOpJudge(param, `${fn}(int256,int256)`);
  d.expectRawWord(b, rhs);
  return a;
}

/** Validate a param as pick(word) over a direct staticcall and return
 *  the inner call. */
function pickedCall(param: DecodedParam, wordIndex: bigint) {
  const pick = d.core(param);
  expect(pick.functionName).to.equal("pick");
  expect(pick.args[1]).to.equal(wordIndex);
  return d.staticCallOf(pick.args[0] as unknown as DecodedParam);
}

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
      name: "folds a nested @token to the composition-time list resolution",
      script: `assertions:assert @underlying!(@superfluid:token(USDCx)) == ${USDC}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // @token folded to the SuperToken address at composition time;
        // the assertion carries only the live underlying read.
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(getAddress(USDCX));
        expect(call.data).to.equal(selectorOf("getUnderlyingToken()"));
      },
    },
    {
      name: "compiles @flow! to a CFA forwarder getFlowrate() staticcall",
      script: `assertions:assert @flow!(${USDCX} ${SOME_ADDRESS} ${RECEIVER}) > 0 "stream stopped"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(signedCmp(param, "gt", 0n));
        expect(call.target).to.equal(getAddress(CFA_FORWARDER));
        expect(call.data).to.equal(
          `${selectorOf("getFlowrate(address,address,address)")}${args(
            BigInt(USDCX),
            BigInt(SOME_ADDRESS),
            BigInt(RECEIVER),
          )}`,
        );
      },
    },
    {
      name: "resolves a @flow! SuperToken symbol at composition time",
      script: `assertions:assert @flow!(USDCx ${SOME_ADDRESS} ${RECEIVER}) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(signedCmp(param, "gt", 0n));
        expect(call.data).to.contain(word(BigInt(USDCX)).slice(2));
      },
    },
    {
      name: "sums the CFA and GDA halves of @netflow! on-chain",
      script: `assertions:assert @netflow!(${USDCX} ${SOME_ADDRESS}) >= 0 "account is draining"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // int96 rates go signed: the add picks its int256 overload.
        const segments = d.opReadOf(
          signedCmp(param, "ge", 0n),
          "add(int256,int256)",
        );
        expect(segments).to.have.lengthOf(2);
        const cfa = d.staticCallOf(segments[0]);
        expect(cfa.target).to.equal(getAddress(CFA_FORWARDER));
        expect(cfa.data).to.equal(
          `${selectorOf("getAccountFlowrate(address,address)")}${args(
            BigInt(USDCX),
            BigInt(SOME_ADDRESS),
          )}`,
        );
        const gda = d.staticCallOf(segments[1]);
        expect(gda.target).to.equal(getAddress(GDA_FORWARDER));
        expect(gda.data).to.equal(
          `${selectorOf("getNetFlow(address,address)")}${args(
            BigInt(USDCX),
            BigInt(SOME_ADDRESS),
          )}`,
        );
      },
    },
    {
      name: "floors the @buffer! rate literal at composition time",
      script: `assertions:assert @buffer!(${USDCX} 1000e18/mo) < 1e18 "buffer too large"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(getAddress(CFA_FORWARDER));
        expect(call.data).to.equal(
          `${selectorOf("getBufferAmountByFlowrate(address,int96)")}${args(
            BigInt(USDCX),
            RATE_1000_PER_MONTH,
          )}`,
        );
      },
    },
    {
      name: "picks the available balance word of @balance!",
      script: `assertions:assert @balance!(${USDCX} ${SOME_ADDRESS}) > 0 "account is critical"`,
      validate: (actions) => {
        // realtimeBalanceOfNow returns four words; word 0 is the
        // available balance, so the operand stays one word.
        const { param } = d.decodeAssert(actions);
        const call = pickedCall(signedCmp(param, "gt", 0n), 0n);
        expect(call.target).to.equal(getAddress(USDCX));
        expect(call.data).to.equal(
          `${selectorOf("realtimeBalanceOfNow(address)")}${args(
            BigInt(SOME_ADDRESS),
          )}`,
        );
      },
    },
    {
      name: "picks the claimable word of @claimable!",
      script: `assertions:assert @claimable!(${POOL} ${RECEIVER}) > 0 "nothing to claim"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = pickedCall(signedCmp(param, "gt", 0n), 0n);
        expect(call.target).to.equal(POOL);
        expect(call.data).to.equal(
          `${selectorOf("getClaimableNow(address)")}${args(BigInt(RECEIVER))}`,
        );
      },
    },
    {
      name: "judges @connected! as a bool read on the GDA forwarder",
      script: `assertions:assert @connected!(${POOL} ${RECEIVER})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(getAddress(GDA_FORWARDER));
        expect(call.data).to.equal(
          `${selectorOf("isMemberConnected(address,address)")}${args(
            BigInt(POOL),
            BigInt(RECEIVER),
          )}`,
        );
        d.expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "compiles the pool-targeted unit reads",
      script: `assertions:assert @units!(${POOL} ${RECEIVER}) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(POOL);
        expect(call.data).to.equal(
          `${selectorOf("getUnits(address)")}${args(BigInt(RECEIVER))}`,
        );
      },
    },
    {
      name: "compiles @totalUnits! to a no-argument pool read",
      script: `assertions:assert @totalUnits!(${POOL}) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(POOL);
        expect(call.data).to.equal(selectorOf("getTotalUnits()"));
      },
    },
    {
      name: "compiles @memberFlowrate! as a signed pool read",
      script: `assertions:assert @memberFlowrate!(${POOL} ${RECEIVER}) >= 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(signedCmp(param, "ge", 0n));
        expect(call.target).to.equal(POOL);
        expect(call.data).to.equal(
          `${selectorOf("getMemberFlowRate(address)")}${args(BigInt(RECEIVER))}`,
        );
      },
    },
    {
      name: "compiles @distributionFlowrate! on the GDA forwarder",
      script: `assertions:assert @distributionFlowrate!(${USDCX} ${SOME_ADDRESS} ${POOL}) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(signedCmp(param, "gt", 0n));
        expect(call.target).to.equal(getAddress(GDA_FORWARDER));
        expect(call.data).to.equal(
          `${selectorOf("getFlowDistributionFlowRate(address,address,address)")}${args(
            BigInt(USDCX),
            BigInt(SOME_ADDRESS),
            BigInt(POOL),
          )}`,
        );
      },
    },
    {
      name: "folds a live @connected! member into a core read splice",
      script: `assertions:assert @connected!(${POOL} ${POOL}::{admin()(address)})`,
      validate: (actions) => {
        // The pool travels as calldata to the forwarder here, so the
        // member may resolve on-chain: the read is spliced, not baked.
        const { param } = d.decodeAssert(actions);
        const { target, selector, segments } = d.readOf(param);
        d.expectRawWord(target, BigInt(GDA_FORWARDER));
        expect(selector).to.equal(
          selectorOf("isMemberConnected(address,address)"),
        );
        expect(segments).to.have.lengthOf(2);
        d.expectRawWord(segments[0], BigInt(POOL));
        expect(d.staticCallOf(segments[1]).target).to.equal(POOL);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a live SuperToken argument",
      script: `assertions:assert @flow!(${USDCX}::{getUnderlyingToken()(address)} ${SOME_ADDRESS} ${RECEIVER}) > 0`,
      error: "resolves its SuperToken at composition time",
    },
  ],
});
