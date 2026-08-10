import "../../setup";
import { CORE_ADDRESS, OPERATORS_ADDRESS } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress } from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATORS = getAddress(OPERATORS_ADDRESS);
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const DIGEST =
  "0x0102030405060708091011121314151617181920212223242526272829303132";

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

describeCommand("assert (@hash! algorithms)", {
  describeName: "Std > helpers > @hash! on-chain algorithms",
  cases: [
    {
      name: "compiles the sha256 branch through a rawCall to precompile 0x02",
      script: `assert @hash!(${TOKEN}::{name()(string)} "sha256") == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // The digest is the third word of the returned bytes envelope.
        const pick = d.core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        const segs = d.opReadOf(
          pick.args[0] as unknown as DecodedParam,
          "rawCall(address,bytes)",
        );
        expect(segs).to.have.lengthOf(2);
        // heads: [target = 0x02][offset_data = 96], envelope spliced last
        expect(segs[0].paramData).to.equal(
          `0x${word(2n).slice(2)}${word(96n).slice(2)}`,
        );
        expect(d.staticCallOf(segs[1]).target).to.equal(TOKEN);
        d.expectConstraint(param, "Eq", BigInt(DIGEST));
      },
    },
    {
      name: "keeps the keccak256 branch on the Operators hash",
      script: `assert @hash!(${TOKEN}::{name()(string)} "keccak256") == ${DIGEST}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "hash(bytes)");
        expect(args).to.have.lengthOf(1);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects an unknown on-chain algorithm",
      script: `assert @hash!(${TOKEN}::{name()(string)} "blake2b") == ${DIGEST}`,
      error: "not supported at assertion time",
    },
  ],
});
