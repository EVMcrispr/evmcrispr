import "../../setup";
import { LEN_STEP } from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
  stringDigest,
  word,
} from "@evmcrispr/test-utils/evml";
import { getAddress, type Hex } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const HOLDER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

const preamble = `load assertions\nload lang\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATORS,
});

/** The single RAW_BYTES literal of a foldWords/foldBytes read: 7 head
 *  words [offset_s][target][offset_template = 224][accOffset][elemOffset]
 *  [init][exit] followed by the template tail at 224; the live payload
 *  envelope splices last with offset_s skipping its 0x20 word. */
function foldLiteral(
  template: Hex,
  accOffset: bigint,
  elemOffset: bigint,
  init: bigint,
  exit: bigint,
): Hex {
  const payload = template.slice(2);
  const padded = payload + "0".repeat((64 - (payload.length % 64)) % 64);
  const tail = `${word(BigInt(payload.length / 2)).slice(2)}${padded}`;
  const envelopeAt = 224 + tail.length / 2;
  return `0x${word(BigInt(envelopeAt + 32)).slice(2)}${word(BigInt(OPERATORS)).slice(2)}${word(224n).slice(2)}${word(accOffset).slice(2)}${word(elemOffset).slice(2)}${word(init).slice(2)}${word(exit).slice(2)}${tail}`;
}

/** A binary lambda template: selector plus two words. */
const template2 = (signature: string, a: bigint, b: bigint): Hex =>
  `0x${selectorOf(signature).slice(2)}${word(a).slice(2)}${word(b).slice(2)}`;

/** Validate the array word-payload extraction: slice(data, 64, 32n) over
 *  the re-framed envelope, the element count read via a LEN-path nav.
 *  Returns the spliced array envelope param. */
function expectWordsPayload(param: DecodedParam): DecodedParam {
  const segs = d.opReadOf(param, "slice(bytes,uint256,uint256)");
  expect(segs).to.have.lengthOf(4);
  // heads: [offset_data = 96][start = 64], the live len follows
  expect(segs[0].paramData).to.equal(
    `0x${word(96n).slice(2)}${word(64n).slice(2)}`,
  );
  const mulArgs = d.opReadOf(segs[1], "mul(uint256,uint256)");
  const lenNav = d.core(mulArgs[0]);
  expect(lenNav.functionName).to.equal("nav");
  expect((lenNav.args[2] as bigint[])[1]).to.equal(LEN_STEP);
  d.expectRawWord(mulArgs[1], 32n);
  const addArgs = d.opReadOf(segs[2], "add(uint256,uint256)");
  d.opReadOf(addArgs[0], "mul(uint256,uint256)");
  d.expectRawWord(addArgs[1], 64n);
  return segs[3];
}

const FOLD_SIG = "foldWords(bytes,address,bytes,uint256,uint256,bytes32,uint8)";

describeCommand("assert (lang on-chain faces)", {
  describeName: "Lang > helpers > on-chain faces",
  preamble,
  cases: [
    // ---- @str.slice! ----------------------------------------------------
    {
      name: "compiles a constant-range @str.slice! to one slice read",
      script: `assertions:assert @str.slice!(${TOKEN}::{name()(string)} 0 5) == "Curve"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "slice(bytes,uint256,uint256)");
        expect(segs).to.have.lengthOf(2);
        // [offset_data = 128][start 0][len 5], envelope spliced last
        expect(segs[0].paramData).to.equal(
          `0x${word(128n).slice(2)}${word(0n).slice(2)}${word(5n).slice(2)}`,
        );
        expect(d.staticCallOf(segs[1]).target).to.equal(TOKEN);
        d.expectConstraint(param, "Eq", BigInt(stringDigest("Curve")));
      },
    },
    {
      name: "resolves a negative @str.slice! start against the live byte length",
      script: `assertions:assert @str.slice!(${TOKEN}::{name()(string)} -5) == "Token"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "slice(bytes,uint256,uint256)");
        expect(segs).to.have.lengthOf(4);
        d.expectRawWord(segs[0], 128n);
        // start = sub(byteLen(s), 5), len = 5 (constant from-the-end tail)
        const subArgs = d.opReadOf(segs[1], "sub(uint256,uint256)");
        d.opReadOf(subArgs[0], "byteLen(bytes)");
        d.expectRawWord(subArgs[1], 5n);
        d.expectRawWord(segs[2], 5n);
        expect(d.staticCallOf(segs[3]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles an open-ended @str.slice! with a live remaining length",
      script: `assertions:assert @str.slice!(${TOKEN}::{name()(string)} 6) == "LP Token"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "slice(bytes,uint256,uint256)");
        expect(segs).to.have.lengthOf(3);
        // [128][6], then len = sub(byteLen(s), 6), envelope last
        expect(segs[0].paramData).to.equal(
          `0x${word(128n).slice(2)}${word(6n).slice(2)}`,
        );
        const subArgs = d.opReadOf(segs[1], "sub(uint256,uint256)");
        d.opReadOf(subArgs[0], "byteLen(bytes)");
        d.expectRawWord(subArgs[1], 6n);
      },
    },
    // ---- @str.at! --------------------------------------------------------
    {
      name: "compiles @str.at! to a one-byte slice",
      script: `assertions:assert @str.at!(${TOKEN}::{symbol()(string)} 0) == "W"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "slice(bytes,uint256,uint256)");
        expect(segs).to.have.lengthOf(2);
        expect(segs[0].paramData).to.equal(
          `0x${word(128n).slice(2)}${word(0n).slice(2)}${word(1n).slice(2)}`,
        );
        d.expectConstraint(param, "Eq", BigInt(stringDigest("W")));
      },
    },
    {
      name: "resolves a negative @str.at! index against the live byte length",
      script: `assertions:assert @str.at!(${TOKEN}::{symbol()(string)} -1) == "H"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "slice(bytes,uint256,uint256)");
        expect(segs).to.have.lengthOf(4);
        d.expectRawWord(segs[0], 128n);
        const subArgs = d.opReadOf(segs[1], "sub(uint256,uint256)");
        d.opReadOf(subArgs[0], "byteLen(bytes)");
        d.expectRawWord(subArgs[1], 1n);
        d.expectRawWord(segs[2], 1n);
      },
    },
    // ---- @at! --------------------------------------------------------------
    {
      name: "compiles @at! to a typed nav step into the array",
      script: `assertions:assert @at!(${TOKEN}::{holders()(address[])} 1) == ${HOLDER}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const nav = d.core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address[])");
        expect(nav.args[2]).to.deep.equal([0n, 1n]);
        expect(
          d.staticCallOf(nav.args[0] as unknown as DecodedParam).target,
        ).to.equal(TOKEN);
        d.expectConstraint(param, "Eq", BigInt(HOLDER));
      },
    },
    {
      name: "keeps a negative @at! index for on-chain from-the-end resolution",
      script: `assertions:assert @at!(${TOKEN}::{tiers()(uint256[])} -1) >= 5`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const nav = d.core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[2]).to.deep.equal([0n, -1n]);
        d.expectConstraint(param, "Gte", 5n);
      },
    },
    {
      name: "appends the @at! step to a lens-selected array",
      script: `assertions:assert @at!(${TOKEN}::{config()(uint256,address[])}[_ $] 0) == ${HOLDER}`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const nav = d.core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(uint256,address[])");
        expect(nav.args[2]).to.deep.equal([1n, 0n]);
      },
    },
    // ---- @includes! (arrays) ------------------------------------------------
    {
      name: "compiles array @includes! to an Any-exit eq foldWords over the word payload",
      script: `assertions:assert @includes!(${TOKEN}::{holders()(address[])} ${HOLDER})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Eq", 1n);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args).to.have.lengthOf(2);
        // eq(<item>, <element>): needle baked at 4, element window at 36,
        // accumulator shares it (eq ignores the accumulator)
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("eq(uint256,uint256)", BigInt(HOLDER), 0n),
            36n,
            36n,
            0n,
            1n, // FoldExit.Any
          ),
        );
        const envelope = expectWordsPayload(args[1]);
        expect(d.staticCallOf(envelope).target).to.equal(TOKEN);
      },
    },
    // ---- @all! / @any! -------------------------------------------------------
    {
      name: "compiles @all! with a comparison predicate to an All-exit foldWords",
      script: `assertions:assert @all!(${TOKEN}::{caps()(uint256[])} @bool!(>= 100))`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Eq", 1n);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args).to.have.lengthOf(2);
        // ge(<element>, 100): element window at 4; the accumulator shares
        // it (the predicate ignores the accumulator, element wins)
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("ge(uint256,uint256)", 0n, 100n),
            4n,
            4n,
            1n,
            2n, // FoldExit.All
          ),
        );
        expectWordsPayload(args[1]);
      },
    },
    {
      name: "compiles @any! with an equality predicate to an Any-exit foldWords",
      script: `assertions:assert @any!(${TOKEN}::{caps()(uint256[])} @bool!(== 0)) == false`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Eq", 0n);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("eq(uint256,uint256)", 0n, 0n),
            4n,
            4n,
            0n,
            1n, // FoldExit.Any
          ),
        );
      },
    },
    {
      name: "compiles a @not! predicate through its eq(element, 0) form",
      script: `assertions:assert @all!(${TOKEN}::{flags()(bool[])} @not!)`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("eq(uint256,uint256)", 0n, 0n),
            4n,
            4n,
            1n,
            2n, // FoldExit.All
          ),
        );
      },
    },
    // ---- @reduce! --------------------------------------------------------------
    {
      name: "compiles @reduce! with add to a Full foldWords at the canonical 4/36 offsets",
      script: `assertions:assert @reduce!(${TOKEN}::{caps()(uint256[])} add 0) >= 100`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Gte", 100n);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args).to.have.lengthOf(2);
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("add(uint256,uint256)", 0n, 0n),
            4n,
            36n,
            0n,
            0n, // FoldExit.Full
          ),
        );
        expectWordsPayload(args[1]);
      },
    },
    {
      name: "accepts a helper-reference reducer and a nonzero init",
      script: `assertions:assert @reduce!(${TOKEN}::{caps()(uint256[])} @max 7) >= 7`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("max(uint256,uint256)", 0n, 0n),
            4n,
            36n,
            7n,
            0n,
          ),
        );
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a non-helper @all! predicate",
      script: `assertions:assert @all!(${TOKEN}::{caps()(uint256[])} 5)`,
      error: "helper-reference predicate",
    },
    {
      name: "rejects a predicate with a nested live call",
      script: `assertions:assert @any!(${TOKEN}::{caps()(uint256[])} @bool!(> ${TOKEN}::{cap()(uint256)}))`,
      error: "nested live call cannot be baked into a fold template",
    },
    {
      name: "rejects a non-boolean predicate",
      script: `assertions:assert @all!(${TOKEN}::{caps()(uint256[])} @num!(+ 1))`,
      error: "must evaluate to a boolean",
    },
    {
      name: "points string returns of @includes! at the str. face",
      script: `assertions:assert @includes!(${TOKEN}::{name()(string)} "LP")`,
      error: "str./bytes. faces",
    },
    {
      name: "rejects an unsupported @reduce! lambda",
      script: `assertions:assert @reduce!(${TOKEN}::{caps()(uint256[])} mul 1) > 0`,
      error: "binary Operators lambda",
    },
    {
      name: "rejects @at! on a non-array return",
      script: `assertions:assert @at!(${TOKEN}::{cap()(uint256)} 0) > 0`,
      error: "needs an array value",
    },
    {
      name: "rejects a dynamic-element array in @includes!",
      script: `assertions:assert @includes!(${TOKEN}::{names()(string[])} "x")`,
      error: "single-word elements",
    },
    {
      name: "rejects an inverted constant @str.slice! range",
      script: `assertions:assert @str.slice!(${TOKEN}::{name()(string)} 5 2) == "x"`,
      error: "before start",
    },
  ],
});
