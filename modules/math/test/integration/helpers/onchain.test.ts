import "../../setup";
import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

const preamble = `load math`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

/** A live uint read to put on the left of a fixed-point call. */
const RATE = `${TOKEN}::{ratePerSecond()(uint256)}`;

describeCommand("assert (math fixed-point faces)", {
  describeName: "Math > helpers > fixed-point on-chain faces",
  preamble,
  cases: [
    {
      name: "compiles @pow! to an rpow read with a wad unit by default",
      script: `assert @math:pow!(${RATE} 3) > 1e18`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "rpow(uint256,uint256,uint256)");
        expect(args).to.have.lengthOf(3);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
        d.expectRawWord(args[1], 3n);
        // The default unit is one wad.
        d.expectRawWord(args[2], 10n ** 18n);
      },
    },
    {
      name: "takes an explicit ray unit",
      script: `assert @math:pow!(${RATE} 31536000 1e27) > 1e27`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "rpow(uint256,uint256,uint256)");
        d.expectRawWord(args[1], 31536000n);
        d.expectRawWord(args[2], 10n ** 27n);
      },
    },
    {
      name: "folds a build-time @pow! entirely",
      script: `assert @num!(@math:pow!(15e17 2) + ${RATE}) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // 1.5^2 = 2.25e18 resolved at composition time, so only the live
        // read survives into the expression.
        const args = d.opReadOf(param, "add(uint256,uint256)");
        expect(args).to.have.lengthOf(2);
        d.expectRawWord(args[0], 2250000000000000000n);
        // The other operand stays a live read (staticCallOf throws if it
        // is not one); which frame it arrives through is not the point.
        d.staticCallOf(args[1]);
      },
    },
    {
      name: "compiles @exp! to a signed wad exponential",
      script: `assert @math:exp!(${TOKEN}::{drift()(int256)}) > 1e18`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // The result is wad-scaled and signed, so the comparison takes the
        // int256 overload and the bound is scaled to meet it.
        const { a } = d.expectOpJudge(param, "gt(int256,int256)");
        const args = d.opReadOf(a, "expWad(int256)");
        expect(args).to.have.lengthOf(1);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @ln! as the inverse read",
      script: `assert @math:ln!(${RATE}) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a } = d.expectOpJudge(param, "gt(int256,int256)");
        d.opReadOf(a, "lnWad(int256)");
      },
    },
    {
      name: "compiles @log2! to the bit-scan read",
      script: `assert @math:log2!(${RATE}) >= 8`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "log2(uint256)");
        expect(args).to.have.lengthOf(1);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
        // Unsigned, so the bound is a native constraint rather than an
        // operator read.
        d.expectConstraint(param, "Gte", 8n);
      },
    },
    {
      name: "scales a fractional bound to a wad result",
      script: `assert @math:exp!(${TOKEN}::{drift()(int256)}) >= 1.05`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // exp! is wad-scaled, so 1.05 travels as the whole number 1.05e18
        // rather than rounding to 1.
        const { b } = d.expectOpJudge(param, "ge(int256,int256)");
        d.expectRawWord(b, 1050000000000000000n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a live @pow! base",
      script: `assert @math:pow!(${RATE} 2 ${RATE}) > 0`,
      error: "resolves its base at composition time",
    },
    {
      name: "rejects a signed @pow! operand",
      script: `assert @math:pow!(${TOKEN}::{drift()(int256)} 2) > 0`,
      error: "unsigned operands",
    },
  ],
});
