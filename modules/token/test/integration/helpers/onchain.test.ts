import "../../setup";
import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
  stringDigest,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);
// DAI on gnosis in the mocked token list.
const DAI = getAddress("0x44fA8E6f47987339850636F88629646662444217");
const OWNER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
const SPENDER = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

const preamble = `load token`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (token on-chain faces)", {
  describeName: "Token > helpers > on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @decimals! of a symbol to a direct decimals() staticcall",
      script: `assert @decimals!(DAI) == 18`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(DAI);
        expect(call.data).to.equal(selectorOf("decimals()"));
        d.expectConstraint(param, "Eq", 18n);
      },
    },
    {
      name: "folds native @decimals! to the chain constant",
      script: `assert @totalSupply!(DAI) > @num!(10 ^ @decimals!(XDAI))`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // exp folds at build time: 10^18 becomes the GTE bound.
        expect(d.staticCallOf(param).target).to.equal(DAI);
        d.expectConstraint(param, "Gte", 10n ** 18n + 1n);
      },
    },
    {
      name: "compiles @totalSupply! to a direct totalSupply() staticcall",
      script: `assert @totalSupply!(DAI) >= 1e18 "supply drained"`,
      validate: (actions) => {
        const { param, message } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(DAI);
        expect(call.data).to.equal(selectorOf("totalSupply()"));
        d.expectConstraint(param, "Gte", 10n ** 18n);
        expect(message).to.equal("supply drained");
      },
    },
    {
      name: "compiles @allowance! with literal owner/spender to plain calldata",
      script: `assert @allowance!(DAI ${OWNER} ${SPENDER}) == 0 "unexpected approval"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(DAI);
        expect(call.data).to.equal(
          `${selectorOf("allowance(address,address)")}${word(BigInt(OWNER)).slice(2)}${word(BigInt(SPENDER)).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "folds a live @allowance! owner into a core read splice",
      script: `assert @allowance!(DAI ${OWNER}::{treasury()(address)} ${SPENDER}) == 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { target, selector, segments } = d.readOf(param);
        d.expectRawWord(target, BigInt(DAI));
        expect(selector).to.equal(selectorOf("allowance(address,address)"));
        expect(segments).to.have.lengthOf(2);
        const ownerCall = d.staticCallOf(segments[0]);
        expect(ownerCall.target).to.equal(OWNER);
        expect(ownerCall.data).to.equal(selectorOf("treasury()"));
        d.expectRawWord(segments[1], BigInt(SPENDER));
      },
    },
    {
      name: "compiles @amount! against the live decimals read",
      script: `assert @allowance!(DAI ${OWNER} ${SPENDER}) >= @amount!(DAI 25)`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a, b } = d.expectOpJudge(param, "ge(uint256,uint256)");
        expect(d.staticCallOf(a).target).to.equal(DAI);
        // mul(25, exp(10, decimals()))
        const mulArgs = d.opReadOf(b, "mul(uint256,uint256)");
        d.expectRawWord(mulArgs[0], 25n);
        const expArgs = d.opReadOf(mulArgs[1], "exp(uint256,uint256)");
        d.expectRawWord(expArgs[0], 10n);
        const decimalsCall = d.staticCallOf(expArgs[1]);
        expect(decimalsCall.target).to.equal(DAI);
        expect(decimalsCall.data).to.equal(selectorOf("decimals()"));
      },
    },
    {
      name: "scales a fractional @amount! mantissa with decimals minus k",
      script: `assert @totalSupply!(DAI) >= @amount!(DAI 1.5)`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { b } = d.expectOpJudge(param, "ge(uint256,uint256)");
        // mul(15, exp(10, sub(decimals(), 1)))
        const mulArgs = d.opReadOf(b, "mul(uint256,uint256)");
        d.expectRawWord(mulArgs[0], 15n);
        const expArgs = d.opReadOf(mulArgs[1], "exp(uint256,uint256)");
        d.expectRawWord(expArgs[0], 10n);
        const subArgs = d.opReadOf(expArgs[1], "sub(uint256,uint256)");
        expect(d.staticCallOf(subArgs[0]).target).to.equal(DAI);
        d.expectRawWord(subArgs[1], 1n);
      },
    },
    {
      name: "folds a native @amount! to base units at build time",
      script: `assert @totalSupply!(DAI) >= @amount!(XDAI 2.5)`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        expect(d.staticCallOf(param).target).to.equal(DAI);
        d.expectConstraint(param, "Gte", 25n * 10n ** 17n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects @totalSupply! of the native token",
      script: `assert @totalSupply!(XDAI) > 0`,
      error: "native token has no total supply",
    },
    {
      name: "rejects a negative @amount!",
      script: `assert @totalSupply!(DAI) >= @amount!(DAI -1)`,
      error: "non-negative decimal",
    },
  ],
});

// ---------------------------------------------------------------------------
//  @symbol!: a plain staticcall String operand, digest-judged and
//  composable with the lang string faces.
// ---------------------------------------------------------------------------

describeCommand("assert (token string faces)", {
  describeName: "Token > helpers > on-chain string faces",
  preamble: `${preamble}\nload lang`,
  cases: [
    {
      name: "compiles @symbol! to a digest-judged symbol() staticcall",
      script: `assert @token:symbol!(DAI) == "DAI" "symbol changed"`,
      validate: (actions) => {
        const { param, message } = d.decodeAssert(actions);
        // Top-level string equality judges the keccak digest of the
        // decoded payload, like every string face.
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        expect(hashArgs).to.have.lengthOf(1);
        const call = d.staticCallOf(hashArgs[0]);
        expect(call.target).to.equal(DAI);
        expect(call.data).to.equal(selectorOf("symbol()"));
        d.expectConstraint(param, "Eq", BigInt(stringDigest("DAI")));
        expect(message).to.equal("symbol changed");
      },
    },
    {
      name: "composes @symbol! with @str.lower! as a nested string face",
      script: `assert @str.lower!(@token:symbol!(DAI)) == "dai"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const lowerSegs = d.opReadOf(hashArgs[0], "toLower(bytes)");
        expect(lowerSegs).to.have.lengthOf(1);
        const call = d.staticCallOf(lowerSegs[0]);
        expect(call.target).to.equal(DAI);
        expect(call.data).to.equal(selectorOf("symbol()"));
        d.expectConstraint(param, "Eq", BigInt(stringDigest("dai")));
      },
    },
  ],
});
