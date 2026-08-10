import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ALL_ONES = (1n << 256n) - 1n;

const preamble = `load assertions\nload lang\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (@bytes.not!)", {
  describeName: "Lang > helpers > @bytes.not!",
  preamble,
  cases: [
    {
      name: "complements a live word with xor against all ones",
      script: `assertions:assert @bytes.not!(${TOKEN}::{mask()(bytes32)}) == ${ZERO32}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // There is no NOT in the operator set, and none is needed:
        // complementing is xor against the all-ones word.
        const args = d.opReadOf(param, "bitXor(uint256,uint256)");
        expect(args).to.have.lengthOf(2);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
        d.expectRawWord(args[1], ALL_ONES);
      },
    },
    {
      name: "folds a constant complement at composition time",
      script: `assertions:assert ${TOKEN}::{mask()(bytes32)} == @bytes.not!(${ZERO32})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        expect(d.staticCallOf(param).target).to.equal(TOKEN);
        d.expectConstraint(param, "Eq", ALL_ONES);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a dynamic bytes value, which has no fixed width",
      script: `assertions:assert @bytes.not!(${TOKEN}::{payload()(bytes)}) == ${ZERO32}`,
      error: "no fixed width to complement",
    },
  ],
});
