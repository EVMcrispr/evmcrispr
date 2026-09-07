import "../../setup";
import {
  CORE_ABI,
  CORE_ADDRESS,
  EXPRESSIONS_ABI,
  EXPRESSIONS_ADDRESS,
  FETCHER_TYPE,
  LEN_STEP,
  OPERATIONS_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import { expect } from "@evmcrispr/test-utils";
import {
  createAssertDecoders,
  type DecodedParam,
  describeCommand,
  selectorOf,
  stringDigest,
  word,
} from "@evmcrispr/test-utils/evml";
import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  type Hex,
  keccak256,
} from "viem";

const ASSERTIONS = getAddress(CORE_ADDRESS);
const OPERATIONS = getAddress(OPERATIONS_ADDRESS);
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const HOLDER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

const preamble = `load lang`;

const d = createAssertDecoders({
  assertions: ASSERTIONS,
  operators: OPERATIONS,
});

/** The single RAW_BYTES literal of a foldWords/foldBytes read: 7 head
 *  words [offset_s][target][offset_template = 224][accOffset]
 *  [offset_elemOffsets][init][exit], the template tail at 224, a
 *  one-element `elemOffsets` array after it, and the live payload
 *  envelope spliced last with offset_s skipping its 0x20 word. */
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
  const offsetsTail = `${word(1n).slice(2)}${word(elemOffset).slice(2)}`;
  const offsetsAt = 224 + tail.length / 2;
  const envelopeAt = offsetsAt + offsetsTail.length / 2;
  return `0x${word(BigInt(envelopeAt + 32)).slice(2)}${word(BigInt(OPERATIONS)).slice(2)}${word(224n).slice(2)}${word(accOffset).slice(2)}${word(BigInt(offsetsAt)).slice(2)}${word(init).slice(2)}${word(exit).slice(2)}${tail}${offsetsTail}`;
}

/** A binary lambda template: selector plus two words. */
const template2 = (signature: string, a: bigint, b: bigint): Hex =>
  `0x${selectorOf(signature).slice(2)}${word(a).slice(2)}${word(b).slice(2)}`;

/** Validate the array word-payload extraction: slice(data, 64, 32n) over
 *  the re-framed envelope, the element count read via a LEN-path nav.
 *  Returns the spliced array envelope param. */
function expectWordsPayload(param: DecodedParam): DecodedParam {
  const call = d.staticCallOf(param);
  expect(call.target).to.equal(getAddress(EXPRESSIONS_ADDRESS));
  const decoded = decodeFunctionData({
    abi: EXPRESSIONS_ABI,
    data: call.data,
  });
  expect(decoded.functionName).to.equal("evaluate");
  if (decoded.functionName !== "evaluate") throw new Error("expected evaluate");
  const [expression] = decoded.args;
  expect(expression.core).to.equal(ASSERTIONS);
  const sources = expression.nodes.filter((n) => n.kind === 2);
  expect(sources).to.have.lengthOf(1);
  expect(sources[0].valueType).to.match(
    /^(u?int\d*|address|bool|bytes32)\[\]$/,
  );
  expect(expression.nodes[Number(expression.result)].selector).to.equal(
    selectorOf("sliceRange(bytes,int256,int256)"),
  );
  const fn = CORE_ABI.find((f) => f.name === "resolve")!;
  return decodeAbiParameters(fn.inputs, sources[0].data)[0] as DecodedParam;
}

const FOLD_SIG =
  "foldWords(bytes,address,bytes,uint256,uint256[],bytes32,uint8)";

describeCommand("assert (lang on-chain faces)", {
  describeName: "Lang > helpers > on-chain faces",
  preamble,
  cases: [
    // ---- @str.slice! ----------------------------------------------------
    {
      name: "compiles a constant-range @str.slice! to one slice read",
      script: `assert @str.slice!(${TOKEN}::{name()(string)} 0 5) == "Curve"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        // One runtime-sized live among words: the `read` host, whose
        // offsets are all literal — [offset_data = 128][start][end] and
        // the envelope spliced last, its own 0x20 word skipped.
        const args = d.opReadOf(
          hashArgs[0],
          "stringSlice(bytes,int256,int256)",
        );
        expect(args).to.have.lengthOf(4);
        d.expectRawWord(args[0], 128n);
        d.expectRawWord(args[1], 0n);
        d.expectRawWord(args[2], 5n);
        expect(d.staticCallOf(args[3]).target).to.equal(TOKEN);
      },
    },
    {
      name: "resolves a negative @str.slice! start against the live byte length",
      script: `assert @str.slice!(${TOKEN}::{name()(string)} -5) == "Token"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(
          hashArgs[0],
          "stringSlice(bytes,int256,int256)",
        );
        d.expectRawWord(args[0], 128n);
        d.expectRawWord(args[1], -5n);
        d.expectRawWord(
          args[2],
          57896044618658097711785492504343953926634992332820282019728792003956564819967n,
        );
        expect(d.staticCallOf(args[3]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles an open-ended @str.slice! with a live remaining length",
      script: `assert @str.slice!(${TOKEN}::{name()(string)} 6) == "LP Token"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(
          hashArgs[0],
          "stringSlice(bytes,int256,int256)",
        );
        d.expectRawWord(args[0], 128n);
        d.expectRawWord(args[1], 6n);
        d.expectRawWord(
          args[2],
          57896044618658097711785492504343953926634992332820282019728792003956564819967n,
        );
        expect(d.staticCallOf(args[3]).target).to.equal(TOKEN);
      },
    },
    // ---- @str.at! --------------------------------------------------------
    {
      name: "compiles @str.at! to a one-byte slice",
      script: `assert @str.at!(${TOKEN}::{symbol()(string)} 0) == "W"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "stringAt(bytes,int256)");
        expect(args).to.have.lengthOf(3);
        d.expectRawWord(args[0], 96n);
        d.expectRawWord(args[1], 0n);
        expect(d.staticCallOf(args[2]).target).to.equal(TOKEN);
      },
    },
    {
      name: "resolves a negative @str.at! index against the live byte length",
      script: `assert @str.at!(${TOKEN}::{symbol()(string)} -1) == "H"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "stringAt(bytes,int256)");
        expect(args).to.have.lengthOf(3);
        d.expectRawWord(args[0], 96n);
        d.expectRawWord(args[1], -1n);
        expect(d.staticCallOf(args[2]).target).to.equal(TOKEN);
      },
    },
    // ---- @at! --------------------------------------------------------------
    {
      name: "compiles @at! to a typed nav step into the array",
      script: `assert @at!(${TOKEN}::{holders()(address[])} 1) == ${HOLDER}`,
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
      script: `assert @at!(${TOKEN}::{tiers()(uint256[])} -1) >= 5`,
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
      script: `assert @at!(${TOKEN}::{config()(uint256,address[])}[_ $] 0) == ${HOLDER}`,
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
      script: `assert @includes!(${TOKEN}::{holders()(address[])} ${HOLDER})`,
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
    {
      // A live element cannot be baked into a lambda template, so it
      // takes the wordIndexOf path: lt(wordIndexOf(s, w), byteLen(s)/32),
      // where the not-found sentinel IS the word count.
      name: "compiles @includes! with a live element to a wordIndexOf comparison",
      script: `assert @includes!(${TOKEN}::{holders()(address[])} ${TOKEN}::{admin()(address)})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Eq", 1n);
        const cmp = d.opReadOf(param, "lt(uint256,uint256)");
        expect(cmp).to.have.lengthOf(2);

        // The needle is a spliced live word, so mergeSegments breaks the
        // heads around it: [offset_s = 96][needle][payload envelope].
        const idx = d.opReadOf(cmp[0], "wordIndexOf(bytes,bytes32)");
        expect(idx).to.have.lengthOf(3);
        d.expectRawWord(idx[0], 96n);
        expect(d.staticCallOf(idx[1]).target).to.equal(TOKEN);
        expect(d.staticCallOf(expectWordsPayload(idx[2])).target).to.equal(
          TOKEN,
        );

        // The sentinel bound: byteLen(payload) / 32.
        const div = d.opReadOf(cmp[1], "div(uint256,uint256)");
        d.opReadOf(div[0], "byteLen(bytes)");
        d.expectRawWord(div[1], 32n);
      },
    },
    // ---- @all! / @any! -------------------------------------------------------
    {
      name: "compiles @all! with a comparison predicate to an All-exit foldWords",
      script: `def @ge100! "$x: number -> bool" @bool!($x >= 100)
assert @all!(${TOKEN}::{caps()(uint256[])} @ge100!)`,
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
      script: `def @isZero! "$x: number -> bool" @bool!($x == 0)
assert @any!(${TOKEN}::{caps()(uint256[])} @isZero!) == false`,
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
      name: "compiles a negated predicate through its eq(element, 0) form",
      script: `def @isOff! "$x: bool -> bool" @bool!(not $x)
assert @all!(${TOKEN}::{flags()(bool[])} @isOff!)`,
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
      script: `assert @reduce!(${TOKEN}::{caps()(uint256[])} add 0) >= 100`,
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
      name: "compiles @reduce! with mul, whose identity init is 1",
      script: `assert @reduce!(${TOKEN}::{caps()(uint256[])} mul 1) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("mul(uint256,uint256)", 0n, 0n),
            4n,
            36n,
            1n,
            0n, // FoldExit.Full
          ),
        );
      },
    },
    {
      // The elements' own signedness picks the overload. Folding an
      // int256[] with the unsigned `min` would read two's-complement
      // negatives as huge positives and return the wrong element, so this
      // case pins the int256 selector specifically.
      name: "picks the signed overload from the element type",
      script: `assert @reduce!(${TOKEN}::{deltas()(int256[])} min 0) <= 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // The fold is now an Int operand, so the ordering comparison
        // cannot ride an ERC-8211 constraint (those are unsigned): it
        // lowers to a signed `le` judged Eq 1, with the fold as its
        // left operand.
        d.expectConstraint(param, "Eq", 1n);
        const cmp = d.opReadOf(param, "le(int256,int256)");
        d.expectRawWord(cmp[1], 0n);
        const args = d.opReadOf(cmp[0], FOLD_SIG);
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("min(int256,int256)", 0n, 0n),
            4n,
            36n,
            0n,
            0n, // FoldExit.Full
          ),
        );
      },
    },
    {
      // The bitwise reducers have no signed reading, so they stay on the
      // uint256 overload even over signed elements.
      name: "keeps a bitwise reducer unsigned over signed elements",
      script: `assert @reduce!(${TOKEN}::{deltas()(int256[])} bitXor 0) >= 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("bitXor(uint256,uint256)", 0n, 0n),
            4n,
            36n,
            0n,
            0n, // FoldExit.Full
          ),
        );
      },
    },
    {
      name: "accepts a helper-reference reducer and a nonzero init",
      script: `assert @reduce!(${TOKEN}::{caps()(uint256[])} @max 7) >= 7`,
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
    // ---- @sum! -----------------------------------------------------------------
    {
      name: "compiles @sum! to a native sumWords over the word payload",
      script: `assert @sum!(${TOKEN}::{caps()(uint256[])}) >= 100`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Gte", 100n);
        // Native sumWords — the fixed-operation form of the general
        // @reduce!(... add 0) foldWords recipe: one on-chain loop, no
        // per-element lambda call. The payload is the single bytes arg.
        const segs = d.opReadOf(param, "sumWords(bytes)");
        expect(segs).to.have.lengthOf(1);
        expectWordsPayload(segs[0]);
      },
    },
    {
      name: "feeds a nested @map! into @sum!",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
assert @sum!(@map!(${TOKEN}::{caps()(uint256[])} @dbl!)) >= 10`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const segs = d.opReadOf(param, "sumWords(bytes)");
        expect(segs).to.have.lengthOf(1);
        d.opReadOf(segs[0], "mapWords(bytes,address,bytes,uint256[])");
        d.expectConstraint(param, "Gte", 10n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a non-helper @all! predicate",
      script: `assert @all!(${TOKEN}::{caps()(uint256[])} 5)`,
      error: "expects a named on-chain definition",
    },
    {
      name: "rejects a non-boolean predicate",
      script: `def @inc! "$x: number -> number" @calc!($x + 1)
assert @all!(${TOKEN}::{caps()(uint256[])} @inc!)`,
      error: "must evaluate to a boolean",
    },
    {
      name: "rejects a non-array @includes! source",
      script: `assert @includes!(${TOKEN}::{name()(string)} "LP")`,
      error: "needs a dynamic array",
    },
    {
      // Elements are single words, so a live string has no word to match.
      // @lookup! hashes live string keys because record keys ARE digests;
      // an address[] holds no digests, so digesting here would silently
      // search for something the array never contains.
      name: "rejects a live string element in @includes!",
      script: `assert @includes!(${TOKEN}::{holders()(address[])} ${TOKEN}::{name()(string)})`,
      error: "hash it first",
    },
    {
      // `mul 1` compiles now, so the rejection case moves to an
      // order-sensitive reducer — the accumulator is always the LEFT
      // argument, so `sub` would differ silently from what most readers
      // picture.
      name: "rejects an order-sensitive @reduce! lambda",
      script: `assert @reduce!(${TOKEN}::{caps()(uint256[])} sub 0) > 0`,
      error: "binary Operations lambda",
    },
    {
      name: "points a folded comparison at @all!/@any!",
      script: `assert @reduce!(${TOKEN}::{caps()(uint256[])} lt 0) > 0`,
      error: "@all! and @any!",
    },
    {
      name: "rejects an absorbing initial accumulator",
      script: `assert @reduce!(${TOKEN}::{caps()(uint256[])} mul 0) > 0`,
      error: "always yields the accumulator itself",
    },
    {
      name: "rejects @at! on a non-array return",
      script: `assert @at!(${TOKEN}::{cap()(uint256)} 0) > 0`,
      error: "needs an array value",
    },
  ],
});

// ---------------------------------------------------------------------------
//  Wave 2: the new Operations vocabulary (string extras + array-shape ops)
// ---------------------------------------------------------------------------

/** A [len][payload padded to 32] bytes tail, as a hex span. */
function tailOf(payload: string): string {
  const len = payload.length / 2;
  const padded = payload + "0".repeat((64 - (payload.length % 64)) % 64);
  return `${word(BigInt(len)).slice(2)}${padded}`;
}

/** The single RAW_BYTES literal of a mapWords read: 4 head words
 *  [offset_s][target][offset_template = 128][offset_elemOffsets], the
 *  template tail, a one-element `elemOffsets` array, then the live
 *  payload envelope. */
function mapLiteral(template: Hex, elemOffset: bigint): Hex {
  const tail = tailOf(template.slice(2));
  const offsetsTail = `${word(1n).slice(2)}${word(elemOffset).slice(2)}`;
  const offsetsAt = 128 + tail.length / 2;
  const envelopeAt = offsetsAt + offsetsTail.length / 2;
  return `0x${word(BigInt(envelopeAt + 32)).slice(2)}${word(BigInt(OPERATIONS)).slice(2)}${word(128n).slice(2)}${word(BigInt(offsetsAt)).slice(2)}${tail}${offsetsTail}`;
}

describeCommand("assert (lang on-chain faces, wave 2)", {
  describeName: "Lang > helpers > on-chain faces (wave 2)",
  preamble,
  cases: [
    {
      name: "compiles @str.replace! with the needle and replacement tails at 96",
      script: `assert @str.replace!(${TOKEN}::{name()(string)} "LP" "Pool") == "Curve Pool Token"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        // Constant needle and replacement are hoisted into the literal
        // run ahead of the one live envelope, so every offset stays a
        // build-time word and the call keeps the `read` host.
        const args = d.opReadOf(hashArgs[0], "replace(bytes,bytes,bytes)");
        expect(args).to.have.lengthOf(2);
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(d.staticCallOf(args[1]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @str.lower! to a single spliced toLower read",
      script: `assert @str.lower!(${TOKEN}::{symbol()(string)}) == "weth"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "toLower(bytes)");
        expect(segs).to.have.lengthOf(1);
        expect(d.staticCallOf(segs[0]).target).to.equal(TOKEN);
        d.expectConstraint(param, "Eq", BigInt(stringDigest("weth")));
      },
    },
    {
      name: "compiles @str.upper! to a single spliced toUpper read",
      script: `assert @str.upper!(${TOKEN}::{symbol()(string)}) == "WETH"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        d.opReadOf(hashArgs[0], "toUpper(bytes)");
      },
    },
    {
      name: "compiles @str.join! to one concat with the delimiter merged into the constant run",
      script: `assert @str.join!(["v" ${TOKEN}::{major()(string)}] ".") == "v.2"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "concat(bytes[],bytes)");
        expect(args).to.have.lengthOf(2);
        // The core gathers every part once into the `bytes[]`, the only
        // live argument, spliced last after the constant delimiter tail.
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(d.core(args[1]).functionName).to.equal("gather");
      },
    },
    {
      name: "merges a trailing @str.join! constant with its delimiter after the live part",
      script: `assert @str.join!([${TOKEN}::{major()(string)} "rc"] "-") == "2-rc"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "concat(bytes[],bytes)");
        expect(args).to.have.lengthOf(2);
        // The core gathers every part once into the `bytes[]`, the only
        // live argument, spliced last after the constant delimiter tail.
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(d.core(args[1]).functionName).to.equal("gather");
      },
    },
    {
      name: "compiles @map! to mapWords with the lambda window at its marker offset",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
assert @map!(${TOKEN}::{caps()(uint256[])} @dbl!) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(
          hashArgs[0],
          "mapWords(bytes,address,bytes,uint256[])",
        );
        expect(segs).to.have.lengthOf(2);
        // mul(<element>, 2): element window at 4
        expect(segs[0].paramData).to.equal(
          mapLiteral(template2("mul(uint256,uint256)", 0n, 2n), 4n),
        );
        expectWordsPayload(segs[1]);
        d.expectConstraint(param, "Eq", BigInt(keccak256("0x1122")));
      },
    },
    {
      name: "nests @sort! inside @unique! for set-uniqueness",
      script: `assert @unique!(@sort!(${TOKEN}::{holders()(address[])})) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const uniqueSegs = d.opReadOf(hashArgs[0], "uniqueWords(bytes,bool)");
        expect(uniqueSegs).to.have.lengthOf(2);
        const [, ordered] = decodeAbiParameters(
          [{ type: "uint256" }, { type: "bool" }],
          uniqueSegs[0].paramData,
        );
        expect(ordered).to.equal(false);
        const sortSegs = d.opReadOf(uniqueSegs[1], "sortWords(bytes)");
        expect(sortSegs).to.have.lengthOf(1);
        expectWordsPayload(sortSegs[0]);
      },
    },
    {
      name: "compiles @reverse! over a nested @map! result",
      script: `def @inc! "$x: number -> number" @calc!($x + 1)
assert @reverse!(@map!(${TOKEN}::{caps()(uint256[])} @inc!)) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const revSegs = d.opReadOf(hashArgs[0], "reverseWords(bytes)");
        expect(revSegs).to.have.lengthOf(1);
        d.opReadOf(revSegs[0], "mapWords(bytes,address,bytes,uint256[])");
      },
    },
    {
      name: "compiles @zip! of a live side with a constant lane",
      script: `assert @zip!(${TOKEN}::{caps()(uint256[])} [7 8]) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "zipWords(bytes,bytes)");
        expect(args).to.have.lengthOf(2);
        // One live side: the constant lane's tail is hoisted into the
        // literal run and the live payload spliced last.
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(
          args[0].paramData.endsWith(
            `${word(7n).slice(2)}${word(8n).slice(2)}`,
          ),
        ).to.equal(true);
        expectWordsPayload(args[1]);
      },
    },
    {
      name: "compiles @unzip! with the lane word after the payload offset",
      script: `assert @unzip!(${TOKEN}::{pairs()(uint256[])} 1) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "unzipWords(bytes,uint256)");
        expect(segs).to.have.lengthOf(2);
        expect(segs[0].paramData).to.equal(
          `0x${word(96n).slice(2)}${word(1n).slice(2)}`,
        );
        expectWordsPayload(segs[1]);
      },
    },

    {
      name: "compiles @flat! of a constant part and a live part",
      script: `assert @flat!([[1 2] ${TOKEN}::{caps()(uint256[])}]) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "concat(bytes[],bytes)");
        expect(args).to.have.lengthOf(2);
        // The core gathers every part once into the `bytes[]`, the only
        // live argument, spliced last after the constant delimiter tail.
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        // The empty separator is the literal run's trailing length word.
        expect(args[0].paramData.slice(-64)).to.equal("0".repeat(64));
        expect(d.core(args[1]).functionName).to.equal("gather");
      },
    },
    {
      name: "compiles @bytes.concat! with hex constants around the live part",
      script: `assert @bytes.concat!(0x1234 ${TOKEN}::{payload()(bytes)}) == 0xabcd`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "concat(bytes[],bytes)");
        expect(args).to.have.lengthOf(2);
        // The core gathers every part once into the `bytes[]`, the only
        // live argument, spliced last after the constant delimiter tail.
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(d.core(args[1]).functionName).to.equal("gather");
      },
    },
    {
      name: "feeds a nested @map! into @reduce!",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
assert @reduce!(@map!(${TOKEN}::{caps()(uint256[])} @dbl!) add 0) >= 10`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args).to.have.lengthOf(2);
        d.opReadOf(args[1], "mapWords(bytes,address,bytes,uint256[])");
        d.expectConstraint(param, "Gte", 10n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a non-boolean @filter! predicate",
      script: `def @inc! "$x: number -> number" @calc!($x + 1)
assert @filter!(${TOKEN}::{caps()(uint256[])} @inc!) == 0x11`,
      error: "callback must return bool",
    },
    {
      name: "points string returns of @lookup! at the str. face",
      script: `assert @lookup!(${TOKEN}::{name()(string)} "fee") == 1`,
      error: "str./bytes. faces",
    },
    {
      name: "rejects an out-of-range @unzip! lane",
      script: `assert @unzip!(${TOKEN}::{pairs()(uint256[])} 2) == 0x11`,
      error: "lane must be 0 or 1",
    },
    {
      name: "rejects an empty @str.replace! needle",
      script: `assert @str.replace!(${TOKEN}::{name()(string)} "" "x") == "y"`,
      error: "non-empty",
    },
    {
      name: "rejects a comparator without a supported direct ABI definition",
      script: `assert @sort!(${TOKEN}::{caps()(uint256[])} @max) == 0x11`,
      error: "Generic collection callback needs a named definition",
    },
  ],
});

// ---------------------------------------------------------------------------
//  Wave 3: filterWords/iotaWords/wordIndexOf — @filter!, @find!,
//  @enumerate! and the record faces (@keys!, @values!, @lookup!), plus
//  @len!/@at! over nested array faces
// ---------------------------------------------------------------------------

describeCommand("assert (lang on-chain faces, wave 3)", {
  describeName: "Lang > helpers > on-chain faces (wave 3)",
  preamble,
  cases: [
    // ---- @filter! / @find! ----------------------------------------------
    {
      name: "compiles @filter! to filterWords with the predicate template",
      script: `def @ge100! "$x: number -> bool" @bool!($x >= 100)
assert @filter!(${TOKEN}::{caps()(uint256[])} @ge100!) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(
          hashArgs[0],
          "filterWords(bytes,address,bytes,uint256[])",
        );
        expect(segs).to.have.lengthOf(2);
        // ge(<element>, 100): element window at 4 — the same lambda
        // machinery and byte layout as @map!, only the selector differs.
        expect(segs[0].paramData).to.equal(
          mapLiteral(template2("ge(uint256,uint256)", 0n, 100n), 4n),
        );
        expectWordsPayload(segs[1]);
        d.expectConstraint(param, "Eq", BigInt(keccak256("0x1122")));
      },
    },

    // ---- @enumerate! -------------------------------------------------------
    {
      // Two live word payloads. offset_a stays a literal; offset_b is a
      // live word `add(pick(env_a, 1), 160)` — the same shape @enumerate!
      // has always emitted, now reached generically. Word payloads are
      // whole words already, so the length IS the padded size and no
      // ceil32 rounding appears.
      name: "resolves both live @zip! sides as canonical arguments",
      script: `assert @zip!(${TOKEN}::{caps()(uint256[])} ${TOKEN}::{tiers()(uint256[])}) == 0x11`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "zipWords(bytes,bytes)");
        expect(args).to.have.lengthOf(2);
        expectWordsPayload(args[0]);
        expectWordsPayload(args[1]);
      },
    },
    {
      name: "splices two live parts into @concat!",
      script: `assert @concat!(${TOKEN}::{caps()(uint256[])} ${TOKEN}::{tiers()(uint256[])}) == 0x11`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "concat(bytes[],bytes)");
        expect(segs).to.have.lengthOf(2);
        expect(segs[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(d.core(segs[1]).functionName).to.equal("gather");
      },
    },
    {
      // Strings are NOT word-aligned, so the second offset has to round
      // the first payload up to a whole number of words before adding:
      // bitAnd(add(pick(env, 1), 31), ~31). This is the case that would
      // still pass if the ceil32 were dropped and every payload happened
      // to be 32-aligned, so it is the one that pins the rounding.
      name: "rounds the first payload to a word boundary in @str.concat!",
      script: `assert @str.concat!(${TOKEN}::{name()(string)} ${TOKEN}::{symbol()(string)}) == "x"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "concat(bytes[],bytes)");
        expect(args).to.have.lengthOf(2);
        // The core gathers every part once into the `bytes[]`, the only
        // live argument, spliced last after the constant delimiter tail.
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(d.core(args[1]).functionName).to.equal("gather");
      },
    },
    {
      // A live needle. indexOf takes two dynamic arguments, so before the
      // splice generalization this could only be a build-time constant.
      name: "splices a live needle into @str.includes!",
      script: `assert @str.includes!(${TOKEN}::{name()(string)} ${TOKEN}::{symbol()(string)})`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Eq", 1n);
        const args = d.opReadOf(param, "contains(bytes,bytes)");
        expect(args).to.have.lengthOf(2);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
        expect(d.staticCallOf(args[1]).target).to.equal(TOKEN);
      },
    },
    {
      name: "splices a live needle and replacement into @str.replace!",
      script: `assert @str.replace!(${TOKEN}::{name()(string)} ${TOKEN}::{symbol()(string)} ${TOKEN}::{version()(string)}) == "x"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "replace(bytes,bytes,bytes)");
        expect(args).to.have.lengthOf(3);
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @str.split! with a live delimiter",
      script: `assert @str.split!(${TOKEN}::{name()(string)} ${TOKEN}::{sep()(string)} 0) == "a"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const selected = d.core(d.opReadOf(param, "hash(bytes)")[0]);
        expect(selected.functionName).to.equal("nav");
        expect(selected.args[1]).to.equal("(string[])");
        expect(selected.args[2]).to.deep.equal([0n, 0n]);
        const split = d.readOf(selected.args[0] as unknown as DecodedParam);
        expect(split.selector).to.equal(selectorOf("split(bytes,bytes)"));
      },
    },
    {
      // Any other index needs the delimiter's LENGTH to step past it, and
      // for a live delimiter that length is itself a read of its envelope.
      name: "reads a live @str.split! delimiter's length for a later segment",
      script: `assert @str.split!(${TOKEN}::{name()(string)} ${TOKEN}::{sep()(string)} 1) == "b"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const selected = d.core(d.opReadOf(param, "hash(bytes)")[0]);
        expect(selected.functionName).to.equal("nav");
        expect(selected.args[1]).to.equal("(string[])");
        expect(selected.args[2]).to.deep.equal([0n, 1n]);
        const split = d.readOf(selected.args[0] as unknown as DecodedParam);
        expect(split.selector).to.equal(selectorOf("split(bytes,bytes)"));
      },
    },
    {
      // A def is INLINED: its body compiles with the call's argument nodes
      // substituted for its parameters, so this must emit exactly what
      // writing the body at the call site emits.
      name: "inlines a bang def called directly in an assertion",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
assert @dbl!(${TOKEN}::{cap()(uint256)}) > 100`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Gte", 101n);
        const args = d.opReadOf(param, "mul(uint256,uint256)");
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
        d.expectRawWord(args[1], 2n);
      },
    },
    {
      // The parameter may be named more than once. Each occurrence is an
      // independent substitution, so the operand is duplicated — the same
      // tree-not-a-DAG property that makes it re-resolve on-chain.
      name: "substitutes a def parameter at every occurrence",
      script: `def @sq! "$x: number -> number" @calc!($x * $x)
assert @sq!(${TOKEN}::{cap()(uint256)}) > 4`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, "mul(uint256,uint256)");
        expect(d.staticCallOf(args[0]).target).to.equal(TOKEN);
        expect(d.staticCallOf(args[1]).target).to.equal(TOKEN);
      },
    },
    {
      name: "lets a bang def call another bang def",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
def @quad! "$x: number -> number" @dbl!(@dbl!($x))
assert @quad!(${TOKEN}::{cap()(uint256)}) > 8`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const outer = d.opReadOf(param, "mul(uint256,uint256)");
        d.expectRawWord(outer[1], 2n);
        const inner = d.opReadOf(outer[0], "mul(uint256,uint256)");
        d.expectRawWord(inner[1], 2n);
        expect(d.staticCallOf(inner[0]).target).to.equal(TOKEN);
      },
    },
    {
      // A named reducer may be order-sensitive: the signature says which
      // side the accumulator is on, which is exactly what the bare `sub`
      // cannot say and why it stays rejected.
      name: "compiles @reduce! with an order-sensitive definition",
      script: `def @subFrom! "$acc: number $e: number -> number" @calc!($acc - $e)
assert @reduce!(${TOKEN}::{caps()(uint256[])} @subFrom! 1000) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        // acc at 4, element at 36 — the canonical windows, reached by
        // naming the parameters rather than by convention.
        expect(args[0].paramData).to.equal(
          foldLiteral(
            template2("sub(uint256,uint256)", 0n, 0n),
            4n,
            36n,
            1000n,
            0n,
          ),
        );
      },
    },
    {
      name: "compiles a composed @reduce! definition through a core-target template",
      script: `def @weighted! "$acc: number $e: number -> number" @calc!($acc + $e * 2)
assert @reduce!(${TOKEN}::{caps()(uint256[])} @weighted! 0) > 0`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        // A two-call body cannot flatten to one direct Operations call, so
        // the lambda target is the CORE and the template is the whole read.
        const lambda = lambdaOf(args[0].paramData, 4);
        expect(lambda.target).to.equal(ASSERTIONS);
        expect(lambda.elemOffsets.length).to.be.greaterThan(0);
      },
    },
    {
      // Descending composes: sort ascending, then reverse. No comparator
      // hook is needed and no contract function was added for it.
      name: "compiles a descending @sort! to a reverse over the sort",
      script: `assert @sort!(${TOKEN}::{caps()(uint256[])} desc) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const rev = d.opReadOf(
          d.opReadOf(param, "hash(bytes)")[0],
          "reverseWords(bytes)",
        );
        d.opReadOf(rev[0], "sortWords(bytes)");
      },
    },
    {
      // Signed elements would otherwise sort by raw word, putting every
      // negative after every positive. The sign bit is flipped in and back
      // out, which is two mapWords passes around the sort.
      name: "flips the sign bit around a signed @sort!",
      script: `assert @sort!(${TOKEN}::{deltas()(int256[])}) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const outer = d.opReadOf(
          d.opReadOf(param, "hash(bytes)")[0],
          "mapWords(bytes,address,bytes,uint256[])",
        );
        const lambda = lambdaOf(outer[0].paramData, 3);
        expect(lambda.target).to.equal(OPERATIONS);
        expect(lambda.elemOffsets).to.deep.equal([4n]);
        expect(lambda.template).to.equal(
          template2("bitXor(uint256,uint256)", 0n, 1n << 255n),
        );
        // The payload is the LAST segment: the sort, whose own input is
        // the inbound flip.
        const sorted = d.opReadOf(outer[outer.length - 1], "sortWords(bytes)");
        d.opReadOf(
          sorted[sorted.length - 1],
          "mapWords(bytes,address,bytes,uint256[])",
        );
      },
    },
    {
      name: "leaves an unsigned @sort! as a bare sortWords",
      script: `assert @sort!(${TOKEN}::{caps()(uint256[])}) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(
          d.opReadOf(param, "hash(bytes)")[0],
          "sortWords(bytes)",
        );
        expectWordsPayload(args[0]);
      },
    },
    {
      name: "compiles @enumerate! to zipWords(iotaWords(n), payload) through the core's get",
      script: `assert @enumerate!(${TOKEN}::{caps()(uint256[])}) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        // BOTH sides are runtime-sized lives, so the call takes the
        // core's `get`: each envelope is resolved once in the core's own
        // frame and the pair encoded there, where the fixed-offset
        // layout had to compute the second offset from the first
        // payload's length — and re-resolve that payload to do so.
        const call = d.readOf(hashArgs[0]);
        expect(call.host).to.equal("get");
        expect(call.argumentTypes).to.equal("(bytes,bytes)");
        const segs = d.opReadOf(hashArgs[0], "zipWords(bytes,bytes)");
        expect(segs).to.have.lengthOf(2);
        // iotaWords(n), n from the LEN-sentinel nav over the same source
        const iotaSegs = d.opReadOf(segs[0], "iotaWords(uint256)");
        expect(iotaSegs).to.have.lengthOf(1);
        const lenNav = d.core(iotaSegs[0]);
        expect(lenNav.functionName).to.equal("nav");
        expect((lenNav.args[2] as bigint[])[1]).to.equal(LEN_STEP);
        expectWordsPayload(segs[1]);
      },
    },
    // ---- @keys! / @values! ---------------------------------------------------
    {
      name: "compiles @keys! to unzipWords lane 0 of the record payload",
      script: `assert @keys!(${TOKEN}::{pairs()(uint256[])}) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "unzipWords(bytes,uint256)");
        expect(segs).to.have.lengthOf(2);
        expect(segs[0].paramData).to.equal(
          `0x${word(96n).slice(2)}${word(0n).slice(2)}`,
        );
        expectWordsPayload(segs[1]);
      },
    },
    {
      name: "compiles @values! over a nested @enumerate! record",
      script: `assert @values!(@enumerate!(${TOKEN}::{caps()(uint256[])})) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(hashArgs[0], "unzipWords(bytes,uint256)");
        expect(segs).to.have.lengthOf(2);
        expect(segs[0].paramData).to.equal(
          `0x${word(96n).slice(2)}${word(1n).slice(2)}`,
        );
        d.opReadOf(segs[1], "zipWords(bytes,bytes)");
      },
    },
    // ---- @lookup! --------------------------------------------------------------
    {
      name: "compiles @lookup! with a composition-time keccak of the string key",
      script: `assert @lookup!(${TOKEN}::{pairs()(uint256[])} "fee") >= 1`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        // value = pick word 2 of slice(values, mul(idx, 32), 32)
        const pick = d.core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        const sliceSegs = d.opReadOf(
          pick.args[0] as unknown as DecodedParam,
          "slice(bytes,uint256,uint256)",
        );
        expect(sliceSegs).to.have.lengthOf(4);
        d.expectRawWord(sliceSegs[0], 128n);
        // start = mul(wordIndexOf(keys, keccak("fee")), 32)
        const mulArgs = d.opReadOf(sliceSegs[1], "mul(uint256,uint256)");
        const idxSegs = d.opReadOf(mulArgs[0], "wordIndexOf(bytes,bytes32)");
        expect(idxSegs).to.have.lengthOf(2);
        expect(idxSegs[0].paramData).to.equal(
          `0x${word(96n).slice(2)}${stringDigest("fee").slice(2)}`,
        );
        const keysLane = d.opReadOf(idxSegs[1], "unzipWords(bytes,uint256)");
        expect(keysLane[0].paramData).to.equal(
          `0x${word(96n).slice(2)}${word(0n).slice(2)}`,
        );
        d.expectRawWord(mulArgs[1], 32n);
        d.expectRawWord(sliceSegs[2], 32n);
        // the values lane is unzip lane 1 of the same record
        const valuesLane = d.opReadOf(
          sliceSegs[3],
          "unzipWords(bytes,uint256)",
        );
        expect(valuesLane[0].paramData).to.equal(
          `0x${word(96n).slice(2)}${word(1n).slice(2)}`,
        );
        d.expectConstraint(param, "Gte", 1n);
      },
    },
    // ---- @len! / @at! over nested faces ------------------------------------
    {
      name: "compiles @len! of a nested face to the payload's word count",
      script: `assert @len!(@sort!(${TOKEN}::{caps()(uint256[])})) == 3`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const divArgs = d.opReadOf(param, "div(uint256,uint256)");
        const byteLenArgs = d.opReadOf(divArgs[0], "byteLen(bytes)");
        d.opReadOf(byteLenArgs[0], "sortWords(bytes)");
        d.expectRawWord(divArgs[1], 32n);
        d.expectConstraint(param, "Eq", 3n);
      },
    },
    {
      name: "compiles @at! of a nested face to a bounds-checked typed nav",
      script: `assert @at!(@sort!(${TOKEN}::{caps()(uint256[])}) 0) >= 1`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const pick = d.core(param);
        expect(pick.functionName).to.equal("nav");
        expect(pick.args[1]).to.equal("(uint256[])");
        expect(pick.args[2]).to.deep.equal([0n, 0n]);
        d.expectConstraint(param, "Gte", 1n);
      },
    },
    {
      name: "keeps a negative nested-face @at! index counting from the end",
      script: `assert @at!(@sort!(${TOKEN}::{caps()(uint256[])}) -1) >= 5`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const pick = d.core(param);
        expect(pick.functionName).to.equal("nav");
        expect(pick.args[1]).to.equal("(uint256[])");
        expect(pick.args[2]).to.deep.equal([0n, -1n]);
        d.expectConstraint(param, "Gte", 5n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects a non-helper @find! predicate",
      script: `assert @find!(${TOKEN}::{caps()(uint256[])} 5) > 0`,
      error: "must be a named definition",
    },
    {
      name: "rejects a dynamic-element array in @enumerate!",
      script: `assert @enumerate!(${TOKEN}::{names()(string[])}) == 0x11`,
      error: "single-word elements",
    },
  ],
});

// ---------------------------------------------------------------------------
//  Wave 4: @bytes.at!, @bytes.slice!, @str.concat! and the array @slice!
// ---------------------------------------------------------------------------

describeCommand("assert (lang on-chain faces, wave 4)", {
  describeName: "Lang > helpers > on-chain faces (wave 4)",
  preamble,
  cases: [
    // ---- @bytes.at! / @bytes.slice! ---------------------------------------
    {
      name: "compiles @bytes.at! to a one-byte slice with the Bytes category",
      script: `assert @bytes.at!(${TOKEN}::{payload()(bytes)} 0) == 0x11`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "byteAt(bytes,int256)");
        expect(args).to.have.lengthOf(3);
        d.expectRawWord(args[0], 96n);
        d.expectRawWord(args[1], 0n);
        expect(d.staticCallOf(args[2]).target).to.equal(TOKEN);
      },
    },
    {
      name: "resolves a negative @bytes.at! index against the live byte length",
      script: `assert @bytes.at!(${TOKEN}::{payload()(bytes)} -1) == 0x22`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "byteAt(bytes,int256)");
        expect(args).to.have.lengthOf(3);
        d.expectRawWord(args[0], 96n);
        d.expectRawWord(args[1], -1n);
        expect(d.staticCallOf(args[2]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles a constant-range @bytes.slice! to one slice read",
      script: `assert @bytes.slice!(${TOKEN}::{payload()(bytes)} 1 3) == 0xabcd`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "sliceRange(bytes,int256,int256)");
        expect(args).to.have.lengthOf(4);
        d.expectRawWord(args[0], 128n);
        d.expectRawWord(args[1], 1n);
        d.expectRawWord(args[2], 3n);
        expect(d.staticCallOf(args[3]).target).to.equal(TOKEN);
      },
    },
    // ---- @str.concat! -------------------------------------------------------
    {
      name: "compiles @str.concat! to one concat with the live part spliced last",
      script: `assert @str.concat!("v" ${TOKEN}::{major()(string)}) == "v2"`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const args = d.opReadOf(hashArgs[0], "concat(bytes[],bytes)");
        expect(args).to.have.lengthOf(2);
        // The core gathers every part once into the `bytes[]`, the only
        // live argument, spliced last after the constant delimiter tail.
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(d.core(args[1]).functionName).to.equal("gather");
      },
    },
    // ---- @slice! (array) ----------------------------------------------------
  ],
  errorCases: [
    {
      name: "points word returns of @bytes.at! at the word faces",
      script: `assert @bytes.at!(${TOKEN}::{cap()(uint256)} 0) == 0x11`,
      error: "needs a string or bytes value",
    },
  ],
});

// ---------------------------------------------------------------------------
//  Wave 5: core-target lambdas — a predicate that does not reduce to one
//  Operations call keeps the whole read(...) calldata as its template and
//  targets the core, which resolves the composed expression per element
//  and raw-returns the inner returndata (first return word = value).
// ---------------------------------------------------------------------------

interface DecodedLambda {
  target: Hex;
  template: Hex;
  /** First `elemOffsets` entry — the N=1 window, or the leftmost of N>1. */
  elemOffset: bigint;
  elemOffsets: bigint[];
  head: (i: number) => bigint;
}

/** Parse a fold/map literal by the words IT carries: the template tail is
 *  located through the literal's own offset_template head, and the
 *  `elemOffsets` array through the offset at `offsetsHead`, so nothing is
 *  re-derived with the compiler's formula. */
function lambdaOf(literal: Hex, offsetsHead: number): DecodedLambda {
  const b = literal.slice(2);
  const head = (i: number) => BigInt(`0x${b.slice(i * 64, i * 64 + 64)}`);
  const target: Hex = getAddress(`0x${b.slice(64 + 24, 128)}`);
  const tplAt = Number(head(2)) * 2;
  const tplLen = Number(BigInt(`0x${b.slice(tplAt, tplAt + 64)}`)) * 2;
  const template: Hex = `0x${b.slice(tplAt + 64, tplAt + 64 + tplLen)}`;
  const offsAt = Number(head(offsetsHead)) * 2;
  const offsLen = Number(BigInt(`0x${b.slice(offsAt, offsAt + 64)}`));
  expect(offsLen).to.be.greaterThan(0);
  const elemOffsets: bigint[] = [];
  for (let i = 0; i < offsLen; i++) {
    const at = offsAt + 64 + i * 64;
    elemOffsets.push(BigInt(`0x${b.slice(at, at + 64)}`));
  }
  return {
    target,
    template,
    elemOffset: elemOffsets[0],
    elemOffsets,
    head,
  };
}

/** What the fold engine does per element: overwrite every 32-byte window
 *  in `elemOffsets` with the element word. */
const SENTINEL: Hex = `0x${"ab".repeat(32)}`;
function substitute(template: Hex, elemOffsets: readonly bigint[]): Hex {
  let b = template.slice(2);
  for (const elemOffset of elemOffsets) {
    const i = Number(elemOffset) * 2;
    expect(i + 64).to.be.at.most(b.length);
    b = `${b.slice(0, i)}${SENTINEL.slice(2)}${b.slice(i + 64)}`;
  }
  return `0x${b}`;
}

/** Decode a core-target template as the core would: a `read` whose
 *  substituted element window is visible to a real ABI decoder. */
function decodeCoreTemplate(lambda: DecodedLambda): {
  selector: Hex;
  segments: readonly DecodedParam[];
} {
  expect(lambda.target).to.equal(ASSERTIONS);
  const call = decodeFunctionData({
    abi: CORE_ABI,
    data: substitute(lambda.template, lambda.elemOffsets),
  });
  expect(call.functionName).to.equal("read");
  const [readTarget, selector, segments] = call.args as unknown as [
    DecodedParam,
    Hex,
    readonly DecodedParam[],
  ];
  expect(readTarget.fetcherType).to.equal(FETCHER_TYPE.RawBytes);
  expect(BigInt(readTarget.paramData)).to.equal(BigInt(OPERATIONS));
  return { selector, segments };
}

const staticCallTarget = (param: DecodedParam): { target: Hex; data: Hex } => {
  expect(param.fetcherType).to.equal(FETCHER_TYPE.StaticCall);
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  ) as [Hex, Hex];
  return { target: getAddress(target), data };
};

describeCommand("assert (lang on-chain faces, wave 5)", {
  describeName: "Lang > helpers > on-chain faces (wave 5: core-target lambdas)",
  preamble,
  cases: [
    {
      // Previously "a nested live call cannot be baked into a fold
      // template". Now the whole gt(<element>, cap()) read IS the
      // template: the nested call stays an unresolved segment the core
      // re-resolves per element.
      name: "compiles a nested-live @any! predicate through a core-target lambda",
      script: `def @overCap! "$x: number -> bool" @bool!($x > ${TOKEN}::{cap()(uint256)})
assert @any!(${TOKEN}::{caps()(uint256[])} @overCap!)`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        d.expectConstraint(param, "Eq", 1n);
        const args = d.opReadOf(param, FOLD_SIG);
        expect(args).to.have.lengthOf(2);
        const lambda = lambdaOf(args[0].paramData, 4);
        // Fold heads: the predicate ignores the accumulator, so both
        // windows share the element offset; init 0, Any exit.
        expect(lambda.head(3)).to.equal(lambda.elemOffset);
        expect(lambda.head(5)).to.equal(0n);
        expect(lambda.head(6)).to.equal(1n); // FoldExit.Any
        const { selector, segments } = decodeCoreTemplate(lambda);
        expect(selector).to.equal(selectorOf("gt(uint256,uint256)"));
        expect(segments).to.have.lengthOf(2);
        // The substituted element lands exactly on the element segment…
        expect(segments[0].paramData).to.equal(SENTINEL);
        // …and the nested live call rides along, unresolved.
        expect(staticCallTarget(segments[1]).target).to.equal(TOKEN);
        expectWordsPayload(args[1]);
      },
    },
    {
      // Previously "must compile to a single Operations call". The
      // composed add(mul(<element>, 2), 1) keeps its expression tree:
      // the element window sits inside the INNER read's encoded
      // calldata, two decodes deep.
      name: "compiles a multi-call @map! lambda through a core-target template",
      script: `def @dblInc! "$x: number -> number" @calc!($x * 2 + 1)
assert @map!(${TOKEN}::{caps()(uint256[])} @dblInc!) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(
          hashArgs[0],
          "mapWords(bytes,address,bytes,uint256[])",
        );
        expect(segs).to.have.lengthOf(2);
        const lambda = lambdaOf(segs[0].paramData, 3);
        const { selector, segments } = decodeCoreTemplate(lambda);
        expect(selector).to.equal(selectorOf("add(uint256,uint256)"));
        expect(BigInt(segments[1].paramData)).to.equal(1n);
        const inner = staticCallTarget(segments[0]);
        expect(inner.target).to.equal(ASSERTIONS);
        const innerRead = decodeFunctionData({
          abi: CORE_ABI,
          data: inner.data,
        });
        expect(innerRead.functionName).to.equal("read");
        const [, innerSelector, innerSegs] = innerRead.args as unknown as [
          DecodedParam,
          Hex,
          readonly DecodedParam[],
        ];
        expect(innerSelector).to.equal(selectorOf("mul(uint256,uint256)"));
        expect(innerSegs[0].paramData).to.equal(SENTINEL);
        expect(BigInt(innerSegs[1].paramData)).to.equal(2n);
        expectWordsPayload(segs[1]);
      },
    },
    {
      // The fast path must survive the generalization: a one-call
      // predicate still targets the Operations contract directly, one
      // staticcall per element.
      name: "keeps the direct Operations target for a one-call predicate",
      script: `def @ge100! "$x: number -> bool" @bool!($x >= 100)
assert @all!(${TOKEN}::{caps()(uint256[])} @ge100!)`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const args = d.opReadOf(param, FOLD_SIG);
        const lambda = lambdaOf(args[0].paramData, 4);
        expect(lambda.target).to.equal(OPERATIONS);
        expect(lambda.template).to.equal(
          template2("ge(uint256,uint256)", 0n, 100n),
        );
        expect(lambda.elemOffset).to.equal(4n);
      },
    },
    {
      name: "keeps the direct Operations target for a one-call @map! lambda",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
assert @map!(${TOKEN}::{caps()(uint256[])} @dbl!) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(
          hashArgs[0],
          "mapWords(bytes,address,bytes,uint256[])",
        );
        const lambda = lambdaOf(segs[0].paramData, 3);
        expect(lambda.target).to.equal(OPERATIONS);
        expect(lambda.template).to.equal(
          template2("mul(uint256,uint256)", 0n, 2n),
        );
        expect(lambda.elemOffset).to.equal(4n);
        expect(lambda.elemOffsets).to.deep.equal([4n]);
      },
    },
    {
      // @it! names the element again beside the prepend: mul(elem, elem).
      // Offsets come from the decoded elemOffsets array (and match a
      // marker scan of the unre-zeroed shape), never from the compiler's
      // own layout arithmetic.
      name: "compiles @map! with @it! to a multi-window square template",
      script: `def @sq! "$x: number -> number" @calc!($x * $x)
assert @map!(${TOKEN}::{caps()(uint256[])} @sq!) == 0x1122`,
      validate: (actions) => {
        const { param } = d.decodeAssert(actions);
        const hashArgs = d.opReadOf(param, "hash(bytes)");
        const segs = d.opReadOf(
          hashArgs[0],
          "mapWords(bytes,address,bytes,uint256[])",
        );
        const lambda = lambdaOf(segs[0].paramData, 3);
        expect(lambda.target).to.equal(OPERATIONS);
        expect(lambda.elemOffsets).to.deep.equal([4n, 36n]);
        expect(lambda.template).to.equal(
          template2("mul(uint256,uint256)", 0n, 0n),
        );
        // Sentinel at BOTH windows decodes as mul(sentinel, sentinel).
        const filled = substitute(lambda.template, lambda.elemOffsets);
        expect(filled).to.equal(
          `0x${selectorOf("mul(uint256,uint256)").slice(2)}${SENTINEL.slice(2)}${SENTINEL.slice(2)}`,
        );
      },
    },
  ],
  errorCases: [
    {
      // Composed predicates still have to BE predicates: the category
      // check precedes the template extraction.
      name: "rejects a non-boolean composed lambda in @all!",
      script: `def @dblInc! "$x: number -> number" @calc!($x * 2 + 1)
assert @all!(${TOKEN}::{caps()(uint256[])} @dblInc!)`,
      error: "must evaluate to a boolean",
    },
    {
      // Inlining is textual, so a def reaching itself would expand forever.
      name: "rejects a self-referential bang def",
      script: `def @loop! "$x: number -> number" @loop!($x)
assert @loop!(1) > 0`,
      error: "defined in terms of itself",
    },
    {
      name: "rejects an indirectly recursive bang def",
      script: `def @a! "$x: number -> number" @b!($x)
def @b! "$x: number -> number" @a!($x)
assert @a!(1) > 0`,
      error: "defined in terms of itself",
    },
    {
      name: "checks a bang def's arity at the call site",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
assert @dbl!(1 2) > 0`,
      error: "expects 1 argument(s), got 2",
    },
    {
      // The face takes the definition by NAME; passing arguments at the
      // call site is the mistake the old inline form invited.
      name: "rejects arguments at the lambda call site",
      script: `def @ge100! "$x: number -> bool" @bool!($x >= 100)
assert @all!(${TOKEN}::{caps()(uint256[])} @ge100!(5))`,
      error: "takes the definition by NAME, with no arguments",
    },

    {
      name: "rejects a one-parameter definition as a reducer",
      script: `def @dbl! "$x: number -> number" @calc!($x * 2)
assert @reduce!(${TOKEN}::{caps()(uint256[])} @dbl! 0) > 0`,
      error: "named definition with matching parameter count",
    },
    {
      name: "rejects a module helper where a definition is required",
      script: `assert @all!(${TOKEN}::{caps()(uint256[])} @bytes.not!)`,
      error: "needs a `def @name!` definition",
    },
    {
      name: "rejects a definition of the wrong parameter count",
      script: `def @between! "$a: number $b: number -> bool" @bool!($a >= $b)
assert @all!(${TOKEN}::{caps()(uint256[])} @between!)`,
      error: "applies a definition of 1 parameter(s), and @between! declares 2",
    },
  ],
});
