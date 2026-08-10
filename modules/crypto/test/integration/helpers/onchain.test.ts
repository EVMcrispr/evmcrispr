import "../../setup";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  describeCommand,
  selectorOf,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress, type Hex } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const DIST = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const ME = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
const ROOT =
  "0x0102030405060708091011121314151617181920212223242526272829303132";
const LEAF =
  "0x1112131415161718192021222324252627282930313233343536373839404142";

const preamble = `load assertions\nload crypto\nload lang\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

/** The RAW_BYTES literal of the merkle foldWords read: 7 head words, the
 *  hashPairSorted(acc, sibling) template at 224 with the canonical 4/36
 *  windows, a one-element `elemOffsets` array after the template, init =
 *  leaf, Full exit; the proof payload splices last. */
function merkleFoldLiteral(leaf: Hex): Hex {
  const template = `${selectorOf("hashPairSorted(bytes32,bytes32)").slice(2)}${word(0n).slice(2)}${word(0n).slice(2)}`;
  const tail = `${word(68n).slice(2)}${template}${"0".repeat(56)}`;
  const offsetsTail = `${word(1n).slice(2)}${word(36n).slice(2)}`;
  const offsetsAt = 224 + tail.length / 2;
  const envelopeAt = offsetsAt + offsetsTail.length / 2;
  return `0x${word(BigInt(envelopeAt + 32)).slice(2)}${word(BigInt(OPERATORS)).slice(2)}${word(224n).slice(2)}${word(4n).slice(2)}${word(BigInt(offsetsAt)).slice(2)}${word(BigInt(leaf)).slice(2)}${word(0n).slice(2)}${tail}${offsetsTail}`;
}

const FOLD_SIG =
  "foldWords(bytes,address,bytes,uint256,uint256[],bytes32,uint8)";

describeCommand("assert (@merkle.verify!)", {
  describeName: "Crypto > helpers > @merkle.verify!",
  preamble,
  cases: [
    {
      name: "folds a live proof through hashPairSorted from the leaf and compares the root",
      script: `assertions:assert @merkle.verify!(${ROOT} ${LEAF} ${DIST}::{proofOf(address)(bytes32[]) ${ME}})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a, b } = d.expectOpJudge(param, "eq(uint256,uint256)");
        d.expectRawWord(b, BigInt(ROOT));
        const foldArgs = d.opReadOf(a, FOLD_SIG);
        expect(foldArgs).to.have.lengthOf(2);
        expect(foldArgs[0].paramData).to.equal(merkleFoldLiteral(LEAF));
        // The proof payload: the bytes32[] envelope re-framed via slice.
        const segs = d.opReadOf(foldArgs[1], "slice(bytes,uint256,uint256)");
        expect(segs).to.have.lengthOf(4);
        const call = d.staticCallOf(segs[3]);
        expect(call.target).to.equal(DIST);
        expect(call.data).to.equal(
          `${selectorOf("proofOf(address)")}${word(BigInt(ME)).slice(2)}`,
        );
      },
    },
    {
      name: "compares against a live root read",
      script: `assertions:assert @merkle.verify!(${DIST}::{root()(bytes32)} ${LEAF} ${DIST}::{proofOf(address)(bytes32[]) ${ME}})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a, b } = d.expectOpJudge(param, "eq(uint256,uint256)");
        d.opReadOf(a, FOLD_SIG);
        const rootCall = d.staticCallOf(b);
        expect(rootCall.target).to.equal(DIST);
        expect(rootCall.data).to.equal(selectorOf("root()"));
      },
    },
    {
      name: "accepts a nested array face as the proof",
      script: `assertions:assert @merkle.verify!(${ROOT} ${LEAF} @reverse!(${DIST}::{proofOf(address)(bytes32[]) ${ME}}))`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const { a } = d.expectOpJudge(param, "eq(uint256,uint256)");
        const foldArgs = d.opReadOf(a, FOLD_SIG);
        d.opReadOf(foldArgs[1], "reverseWords(bytes)");
      },
    },
    {
      // @merkle.root has no `!` face and does not need one: a root is
      // built from leaves the script already holds, so the plain helper
      // folds to a constant that the expression then compares against a
      // live read. (An on-chain root over LIVE leaves is a different
      // thing entirely, and is not expressible: the reduction halves the
      // array each round, and mapWords is one-to-one.)
      name: "folds a plain @merkle.root into the expression as a constant",
      script: `assertions:assert ${DIST}::{merkleRoot()(bytes32)} == @crypto:merkle.root([${LEAF} ${ROOT}])`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const call = d.staticCallOf(param);
        expect(call.target).to.equal(DIST);
        expect(call.data).to.equal(selectorOf("merkleRoot()"));
        // One constraint carrying a build-time root: no fold on-chain.
        expect(param.constraints).to.have.lengthOf(1);
      },
    },
  ],
  errorCases: [
    {
      name: "keeps positional (indexed) verification off-chain",
      script: `assertions:assert @merkle.verify!(${ROOT} ${LEAF} ${DIST}::{proofOf(address)(bytes32[]) ${ME}} 1)`,
      error: "positional (indexed) verification stays off-chain",
    },
    {
      name: "rejects a constant proof array",
      script: `assertions:assert @merkle.verify!(${ROOT} ${LEAF} [${LEAF}])`,
      error: "expects a `::` call expression",
    },
    {
      name: "rejects a non-bytes32 live root",
      script: `assertions:assert @merkle.verify!(${DIST}::{rootCount()(uint256)} ${LEAF} ${DIST}::{proofOf(address)(bytes32[]) ${ME}})`,
      error: "root must be a bytes32 value",
    },
  ],
});
