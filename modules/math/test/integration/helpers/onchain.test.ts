import "../../setup";
import { CORE_ADDRESS, OPERATIONS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATIONS = getAddress(OPERATIONS_ADDRESS);
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

const preamble = `load math`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATIONS,
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
  ],
  errorCases: [
    {
      name: "requires raw integer units before using a scaled pow result in calc",
      script: `assert @calc!(@math:pow!(15e17 2) + ${RATE}) > 0`,
      error: "requires unscaled integer operands",
    },
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
