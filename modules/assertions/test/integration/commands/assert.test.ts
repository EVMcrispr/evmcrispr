import "../../setup";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  encodePacked,
  getAddress,
  keccak256,
  numberToHex,
  stringToHex,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import {
  ASSERTIONS_ADDRESS,
  OPERATORS_ADDRESS,
} from "../../../src/lib/assertions";
import { CORE_ABI, LEN_STEP } from "../../../src/lib/core";
import {
  ASSERTIONS_ABI,
  CONSTRAINT_TYPE,
  FETCHER_TYPE,
} from "../../../src/lib/erc8211";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const HOLDER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
// DAI on gnosis in the mocked token list.
const DAI = getAddress("0x44fA8E6f47987339850636F88629646662444217");
// Distinct targets for the nested live-call examples.
const A = getAddress("0xa111111111111111111111111111111111111111");
const B = getAddress("0xb222222222222222222222222222222222222222");
const C = getAddress("0xc333333333333333333333333333333333333333");
const D = getAddress("0xd444444444444444444444444444444444444444");
const ME = getAddress("0xe555555555555555555555555555555555555555");

const preamble = `load assertions\nload lang\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const WORD_MASK = (1n << 256n) - 1n;
const word = (v: bigint) => numberToHex(v & WORD_MASK, { size: 32 });

interface Constraint {
  constraintType: number;
  referenceData: `0x${string}`;
}
interface Param {
  paramType: number;
  fetcherType: number;
  paramData: `0x${string}`;
  constraints: readonly Constraint[];
}

function selectorOf(signature: string): `0x${string}` {
  return toFunctionSelector(`function ${signature}`);
}

function theAction(actions: any[], to: Address) {
  expect(actions).to.have.lengthOf(1);
  const action = actions[0];
  expect(isTransactionAction(action), "expected a transaction action").to.be
    .true;
  expect(action.readOnly, "expected readOnly flag").to.equal(true);
  expect(getAddress(action.to)).to.equal(to);
  return action;
}

/** Decode the emitted action as assertParam(param[, message]). */
function decodeAssert(
  actions: any[],
  to: Address = ASSERTIONS,
): { param: Param; message: string } {
  const action = theAction(actions, to);
  const { functionName, args } = decodeFunctionData({
    abi: ASSERTIONS_ABI,
    data: action.data,
  });
  expect(functionName).to.equal("assertParam");
  return {
    param: args[0] as unknown as Param,
    message: (args.length > 1 ? args[1] : "") as string,
  };
}

/** Decode a STATIC_CALL param's (target, calldata). */
function staticCallOf(param: Param): { target: Address; data: `0x${string}` } {
  expect(param.fetcherType, "expected a STATIC_CALL fetcher").to.equal(
    FETCHER_TYPE.StaticCall,
  );
  const [target, data] = decodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }],
    param.paramData,
  ) as [Address, `0x${string}`];
  return { target: getAddress(target), data };
}

/** Decode a param as a core-primitive call (STATIC_CALL to the core). */
function core(param: Param, at: Address = ASSERTIONS) {
  const { target, data } = staticCallOf(param);
  expect(target).to.equal(at);
  return decodeFunctionData({ abi: CORE_ABI, data });
}

/** A param pointed straight at the Operators contract (an argument-free
 *  or literal-argument read, no core wrapper) — returns its calldata. */
function opsDirect(param: Param, at: Address = OPERATORS): `0x${string}` {
  const { target, data } = staticCallOf(param);
  expect(target).to.equal(at);
  return data;
}

function expectConstraint(
  param: Param,
  type: keyof typeof CONSTRAINT_TYPE,
  value: bigint,
) {
  expect(param.constraints).to.have.lengthOf(1);
  const c = param.constraints[0];
  expect(c.constraintType).to.equal(CONSTRAINT_TYPE[type]);
  expect(BigInt(c.referenceData)).to.equal(value & WORD_MASK);
}

function expectIn(param: Param, lower: bigint, upper: bigint) {
  expect(param.constraints).to.have.lengthOf(1);
  const c = param.constraints[0];
  expect(c.constraintType).to.equal(CONSTRAINT_TYPE.In);
  expect(c.referenceData).to.equal(
    `0x${word(lower).slice(2)}${word(upper).slice(2)}`,
  );
}

function expectRawWord(param: Param, value: bigint) {
  expect(param.fetcherType).to.equal(FETCHER_TYPE.RawBytes);
  expect(BigInt(param.paramData)).to.equal(value & WORD_MASK);
}

/** Decode a param as core.read: the runtime-resolved target, the 4-byte
 *  selector and the calldata segments the judge concatenates. */
function readOf(param: Param): {
  target: Param;
  selector: `0x${string}`;
  segments: readonly Param[];
} {
  const call = core(param);
  expect(call.functionName).to.equal("read");
  return {
    target: call.args[0] as unknown as Param,
    selector: call.args[1] as `0x${string}`,
    segments: call.args[2] as unknown as readonly Param[],
  };
}

/** Decode a param as read(operators, opSignature, args) — the composed
 *  Operators expression shape — and return the spliced operands. */
function opReadOf(param: Param, signature: string): readonly Param[] {
  const { target, selector, segments } = readOf(param);
  expectRawWord(target, BigInt(OPERATORS));
  expect(selector).to.equal(selectorOf(signature));
  return segments;
}

/** A binary operator read judged EQ 1 — the shape != and every non-plain
 *  comparison compile to (comparisons return 0/1 bool words). */
function expectOpJudge(
  param: Param,
  signature: string,
): { a: Param; b: Param } {
  expectConstraint(param, "Eq", 1n);
  const args = opReadOf(param, signature);
  expect(args).to.have.lengthOf(2);
  return { a: args[0], b: args[1] };
}

/** keccak256 of the decoded payload bytes — hash splices the resolved
 *  envelope, so the digest covers the payload, not the ABI envelope. */
const stringDigest = (s: string) => keccak256(stringToHex(s));

/** Validate an indexOf read with a constant needle and occurrence ordinal:
 *  heads are [offset_s][96][occurrence], the needle tail sits at 96 and
 *  the live haystack envelope is spliced last with offset_s skipping its
 *  0x20 word. Returns the haystack segment. */
function expectIndexOf(
  param: Param,
  needle: string,
  occurrence: bigint,
): Param {
  const args = opReadOf(param, "indexOf(bytes,bytes,int256)");
  expect(args).to.have.lengthOf(2);
  const payload = stringToHex(needle).slice(2);
  const padded = payload + "0".repeat((64 - (payload.length % 64)) % 64);
  const tail = `${word(BigInt(payload.length / 2)).slice(2)}${padded}`;
  const envelopeAt = 96 + tail.length / 2;
  expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
  expect(args[0].paramData).to.equal(
    `0x${word(BigInt(envelopeAt + 32)).slice(2)}${word(96n).slice(2)}${word(occurrence).slice(2)}${tail}`,
  );
  return args[1];
}

/** Validate a slice read: [offset_data = 128][start][len] with the live
 *  envelope spliced at 96. Returns the word segments and the haystack. */
function expectSlice(param: Param): { segments: readonly Param[] } {
  const args = opReadOf(param, "slice(bytes,uint256,uint256)");
  return { segments: args };
}

/** The single RAW_BYTES literal of a charset foldBytes read: 7 head words
 *  [offset_s][target][offset_template][36][36][init 1][exit All], then the
 *  bitSet(mask, 0) template tail at 224; the envelope splices at 352. */
function charsetLiteral(mask: bigint): `0x${string}` {
  const template = `${selectorOf("bitSet(uint256,uint256)").slice(2)}${word(mask).slice(2)}${word(0n).slice(2)}`;
  const tail = `${word(68n).slice(2)}${template}${"0".repeat(56)}`;
  return `0x${word(384n).slice(2)}${word(BigInt(OPERATORS)).slice(2)}${word(224n).slice(2)}${word(36n).slice(2)}${word(36n).slice(2)}${word(1n).slice(2)}${word(2n).slice(2)}${tail}`;
}

describeCommand("assert", {
  describeName: "Assertions > commands > assert",
  preamble,
  cases: [
    {
      name: "encodes a >= comparison as a GTE constraint (inline ABI)",
      script: `assertions:assert ${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}} >= 10e18 "insufficient"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        const { target, data } = staticCallOf(param);
        expect(target).to.equal(TOKEN);
        expect(data.startsWith(selectorOf("balanceOf(address)"))).to.be.true;
        expectConstraint(param, "Gte", 10n * 10n ** 18n);
        expect(message).to.equal("insufficient");
      },
    },
    {
      name: "selects a tuple element with a destructure lens via pick",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[_ $ _] >= 1000 "low reserve"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const pick = core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(1n);
        const inner = staticCallOf(pick.args[0] as unknown as Param);
        expect(inner.target).to.equal(TOKEN);
        expectConstraint(param, "Gte", 1000n);
      },
    },
    {
      name: "compiles an element lens to a typed nav judged as the terminal type",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[_ $]] == ${HOLDER}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        const inner = staticCallOf(nav.args[0] as unknown as Param);
        expect(inner.target).to.equal(TOKEN);
        expect(nav.args[1]).to.equal("(address[],address)");
        expect(nav.args[2]).to.deep.equal([0n, 1n]);
        expectConstraint(param, "Eq", BigInt(HOLDER));
      },
    },
    {
      name: "compiles a deep lens through nested arrays",
      script: `assertions:assert ${TOKEN}::{matrix()(address[][])}[[_ _ _ [_ $]]] == ${HOLDER}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address[][])");
        expect(nav.args[2]).to.deep.equal([0n, 3n, 1n]);
      },
    },
    {
      name: "compiles a struct-array field lens against a tuple descriptor",
      script: `assertions:assert ${TOKEN}::{proposals()((address,uint256,bool)[])}[[_ [_ _ $]]] == true`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("((address,uint256,bool)[])");
        expect(nav.args[2]).to.deep.equal([0n, 1n, 2n]);
        expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "compiles a nested element lens inside an expression",
      script: `assertions:assert @bool!(${TOKEN}::{tiers()(uint256[])}[[_ _ $]] > 5)`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "gt(uint256,uint256)");
        const element = core(a);
        expect(element.functionName).to.equal("nav");
        expect(element.args[1]).to.equal("(uint256[])");
        expect(element.args[2]).to.deep.equal([0n, 2n]);
        expectRawWord(b, 5n);
      },
    },
    {
      name: "compiles @len! over a lensed call through a LEN-path nav",
      script: `assertions:assert @len!(${TOKEN}::{matrix()(address[][])}[[_ $]]) >= 3`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address[][])");
        expect(nav.args[2]).to.deep.equal([0n, 1n, LEN_STEP]);
        expectConstraint(param, "Gte", 3n);
      },
    },
    {
      name: "compiles @str.split! over a lensed struct-array string field",
      script: `assertions:assert @str.split!(${TOKEN}::{items()((string,uint256)[])}[[[$ _]]] " " -1) == "LP"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        // string == constant → hash of the slice judged EQ the payload digest
        const hashArgs = opReadOf(param, "hash(bytes)");
        expect(hashArgs).to.have.lengthOf(1);
        // split(s, " ", -1) = slice(s, start, byteLen(s) - start) with
        // start = indexOf(s, " ", -1) + 1
        const { segments } = expectSlice(hashArgs[0]);
        expect(segments).to.have.lengthOf(4);
        expectRawWord(segments[0], 128n);
        const startArgs = opReadOf(segments[1], "add(uint256,uint256)");
        const lensed = expectIndexOf(startArgs[0], " ", -1n);
        const nav = core(lensed);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("((string,uint256)[])");
        expect(nav.args[2]).to.deep.equal([0n, 0n, 0n]);
        expectRawWord(startArgs[1], 1n);
        const lenArgs = opReadOf(segments[2], "sub(uint256,uint256)");
        opReadOf(lenArgs[0], "byteLen(bytes)");
        expectConstraint(param, "Eq", BigInt(stringDigest("LP")));
      },
    },
    {
      name: "resolves a rest-lens over a known-arity return at build time",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[... $ _] >= 1000 "low reserve"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const pick = core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(1n);
      },
    },
    {
      name: "resolves a fixed-array element lens (end-anchored) at build time",
      script: `assertions:assert ${TOKEN}::{config()(address,address[2])}[_ [... $]] == ${HOLDER}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address,address[2])");
        expect(nav.args[2]).to.deep.equal([1n, 1n]);
      },
    },
    {
      name: "keeps a rest-lens over a dynamic array negative for on-chain resolution",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[... $]] == ${HOLDER}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address[],address)");
        expect(nav.args[2]).to.deep.equal([0n, -1n]);
      },
    },
    {
      name: "judges a bare boolean assertion as EQ 1",
      script: `assertions:assert ${TOKEN}::{paused()(bool)}`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        const { target } = staticCallOf(param);
        expect(target).to.equal(TOKEN);
        expectConstraint(param, "Eq", 1n);
        expect(message).to.equal("");
      },
    },
    {
      name: "compiles ~= with --delta to an IN range constraint",
      script: `assertions:assert ${TOKEN}::{price()(uint256)} ~= 2000 --delta 50 "off"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        expectIn(param, 1950n, 2050n);
        expect(message).to.equal("off");
      },
    },
    // ---- int256 --------------------------------------------------------
    {
      name: "routes an int256 comparison through the int256 overload",
      script: `assertions:assert ${TOKEN}::{drift()(int256)} <= -5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "le(int256,int256)");
        expect(staticCallOf(a).target).to.equal(TOKEN);
        expectRawWord(b, -5n);
      },
    },
    {
      name: "judges a tuple-indexed int256 equality directly (words compare exactly)",
      script: `assertions:assert ${TOKEN}::{pair()(int256,uint256)}[$ _] == -1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const pick = core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(0n);
        expectConstraint(param, "Eq", -1n);
      },
    },
    {
      name: "compiles ~= on an int return to absDiff(int256) LTE delta",
      script: `assertions:assert ${TOKEN}::{drift()(int256)} ~= -100 --delta 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Lte", 5n);
        const args = opReadOf(param, "absDiff(int256,int256)");
        expect(args).to.have.lengthOf(2);
        expectRawWord(args[1], -100n);
      },
    },
    // ---- booleans fold != into EQ constraints --------------------------
    {
      name: "compiles `!= true` to an EQ 0 constraint",
      script: `assertions:assert ${TOKEN}::{paused()(bool)} != true`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(staticCallOf(param).target).to.equal(TOKEN);
        expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "compiles `== false` to an EQ 0 constraint",
      script: `assertions:assert ${TOKEN}::{paused()(bool)} == false`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "compiles an indexed bool != through pick with the negated bound",
      script: `assertions:assert ${TOKEN}::{flags()(bool,bool)}[$ _] != true`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const pick = core(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(0n);
        expectConstraint(param, "Eq", 0n);
      },
    },
    // ---- strings and bytes ----------------------------------------------
    {
      name: "judges a string equality via hash against the payload digest",
      script: `assertions:assert ${TOKEN}::{name()(string)} == "Wrapped Ether"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        expect(hashArgs).to.have.lengthOf(1);
        expect(staticCallOf(hashArgs[0]).target).to.equal(TOKEN);
        expectConstraint(param, "Eq", BigInt(stringDigest("Wrapped Ether")));
      },
    },
    {
      name: "compiles a string != to ne over the digest",
      script: `assertions:assert ${TOKEN}::{name()(string)} != "Foo"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "ne(uint256,uint256)");
        const hashArgs = opReadOf(a, "hash(bytes)");
        expect(hashArgs).to.have.lengthOf(1);
        expectRawWord(b, BigInt(stringDigest("Foo")));
      },
    },
    {
      name: "judges a bytes equality via hash of the decoded payload",
      script: `assertions:assert ${TOKEN}::{payload()(bytes)} == 0x1234`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        expect(hashArgs).to.have.lengthOf(1);
        expectConstraint(param, "Eq", BigInt(keccak256("0x1234")));
      },
    },
    // ---- constant side normalization -------------------------------------
    {
      name: "mirrors the operator when the constant is on the left",
      script: `assertions:assert 5 < ${TOKEN}::{supply()(uint256)}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(staticCallOf(param).target).to.equal(TOKEN);
        // 5 < x ≡ x > 5 ≡ x GTE 6
        expectConstraint(param, "Gte", 6n);
      },
    },
    {
      name: "folds constant subexpressions at build time",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} >= @num!(2 * 3e18)`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(staticCallOf(param).target).to.equal(TOKEN);
        expectConstraint(param, "Gte", 6n * 10n ** 18n);
      },
    },
    // ---- :: chains → core chain -------------------------------------------
    {
      name: "compiles a :: chain through the core chain primitive",
      script: `assertions:assert ${TOKEN}::{vault()(address)}::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        const chain = core(hashArgs[0]);
        expect(chain.functionName).to.equal("chain");
        const start = chain.args[0] as unknown as Param;
        expectRawWord(start, BigInt(TOKEN));
        const hops = chain.args[1] as `0x${string}`[];
        expect(hops).to.have.lengthOf(2);
        expect(hops[0]).to.equal(selectorOf("vault()"));
        expect(hops[1]).to.equal(selectorOf("symbol()"));
        expectConstraint(param, "Eq", BigInt(stringDigest("WETH")));
      },
    },
    {
      name: "chains through a lens-selected address of a multi-value return",
      script: `assertions:assert ${TOKEN}::{poolInfo()(uint112,uint112,address)}[_ _ $]::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        const chain = core(hashArgs[0]);
        expect(chain.functionName).to.equal("chain");
        // The mid-chain lens wraps the prefix in pick(word 2) as the start.
        const pick = core(chain.args[0] as unknown as Param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(2n);
        expect(staticCallOf(pick.args[0] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expect(chain.args[1]).to.deep.equal([selectorOf("symbol()")]);
      },
    },
    {
      name: "chains through an array-element lens by rewrapping in nav",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[$]]::{decimals()(uint256)} == 18`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const chain = core(param);
        expect(chain.functionName).to.equal("chain");
        const nav = core(chain.args[0] as unknown as Param);
        expect(nav.functionName).to.equal("nav");
        expect(staticCallOf(nav.args[0] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expect(nav.args[1]).to.equal("(address[],address)");
        expect(nav.args[2]).to.deep.equal([0n, 0n]);
        expect(chain.args[1]).to.deep.equal([selectorOf("decimals()")]);
        expectConstraint(param, "Eq", 18n);
      },
    },
    // ---- @len! -----------------------------------------------------------
    {
      name: "compiles a top-level @len! to a LEN-sentinel nav",
      script: `assertions:assert @len!(${TOKEN}::{holders()(address[])}) >= 3`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        expect(staticCallOf(nav.args[0] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expect(nav.args[1]).to.equal("(address[])");
        expect(nav.args[2]).to.deep.equal([0n, LEN_STEP]);
        expectConstraint(param, "Gte", 3n);
      },
    },
    {
      name: "supports != on @len! via ne judged EQ 1",
      script: `assertions:assert @len!(${TOKEN}::{holders()(address[])}) != 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "ne(uint256,uint256)");
        expect(core(a).functionName).to.equal("nav");
        expectRawWord(b, 0n);
      },
    },
    {
      name: "routes a chained @len! argument through the core chain",
      script: `assertions:assert @len!(${TOKEN}::{vault()(address)}::{holders()(address[])}) == 2`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        const chain = core(nav.args[0] as unknown as Param);
        expect(chain.functionName).to.equal("chain");
        expectConstraint(param, "Eq", 2n);
      },
    },
    {
      name: "compiles a nested @len! inside an expression",
      script: `assertions:assert @num!(@len!(${TOKEN}::{holders()(address[])}) * 2) > 4`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 5n);
        const args = opReadOf(param, "mul(uint256,uint256)");
        const left = core(args[0]);
        expect(left.functionName).to.equal("nav");
        expect(left.args[1]).to.equal("(address[])");
        expect(left.args[2]).to.deep.equal([0n, LEN_STEP]);
        expectRawWord(args[1], 2n);
      },
    },
    // ---- other chain-call helpers -----------------------------------------
    {
      name: "compiles @str.split! to an indexOf + slice composition hashed for the string equality",
      script: `assertions:assert @str.split!(${TOKEN}::{name()(string)} " " 1) == "LP"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        // split(s, " ", 1) = slice(s, start, end - start) with
        // start = indexOf(s, " ", 0) + 1 and end = indexOf(s, " ", 1) —
        // both boundaries are constant occurrence ordinals
        const { segments } = expectSlice(hashArgs[0]);
        expect(segments).to.have.lengthOf(4);
        expectRawWord(segments[0], 128n);
        const startArgs = opReadOf(segments[1], "add(uint256,uint256)");
        const haystack = expectIndexOf(startArgs[0], " ", 0n);
        expect(staticCallOf(haystack).target).to.equal(TOKEN);
        expectRawWord(startArgs[1], 1n);
        const lenArgs = opReadOf(segments[2], "sub(uint256,uint256)");
        expectIndexOf(lenArgs[0], " ", 1n);
        expect(staticCallOf(segments[3]).target).to.equal(TOKEN);
        expectConstraint(param, "Eq", BigInt(stringDigest("LP")));
      },
    },
    {
      name: "compiles the -1 @str.split! index via the last-occurrence indexOf",
      script: `assertions:assert @str.split!(${TOKEN}::{name()(string)} " " -1) == "Token"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        const { segments } = expectSlice(hashArgs[0]);
        expect(segments).to.have.lengthOf(4);
        const startArgs = opReadOf(segments[1], "add(uint256,uint256)");
        expectIndexOf(startArgs[0], " ", -1n);
        const lenArgs = opReadOf(segments[2], "sub(uint256,uint256)");
        opReadOf(lenArgs[0], "byteLen(bytes)");
        expectConstraint(param, "Eq", BigInt(stringDigest("Token")));
      },
    },
    {
      name: "compiles a -2 @str.split! index between two end-anchored occurrences",
      script: `assertions:assert @str.split!(${TOKEN}::{name()(string)} " " -2) == "LP"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        // split(s, " ", -2) = slice(s, start, end - start) with
        // start = indexOf(s, " ", -2) + 1 and end = indexOf(s, " ", -1)
        const { segments } = expectSlice(hashArgs[0]);
        expect(segments).to.have.lengthOf(4);
        const startArgs = opReadOf(segments[1], "add(uint256,uint256)");
        expectIndexOf(startArgs[0], " ", -2n);
        expectRawWord(startArgs[1], 1n);
        const lenArgs = opReadOf(segments[2], "sub(uint256,uint256)");
        expectIndexOf(lenArgs[0], " ", -1n);
        expectConstraint(param, "Eq", BigInt(stringDigest("LP")));
      },
    },
    {
      name: "compiles a nested string equality to an on-chain keccak comparison",
      script: `assertions:assert @bool!(@str.split!(${TOKEN}::{name()(string)} " " -1) == "LP")`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "eq(uint256,uint256)");
        const hashArgs = opReadOf(a, "hash(bytes)");
        expectSlice(hashArgs[0]);
        expectRawWord(b, BigInt(stringDigest("LP")));
      },
    },
    {
      name: "compiles two live strings to a keccak-vs-keccak comparison",
      script: `assertions:assert ${TOKEN}::{name()(string)} == ${TOKEN}::{symbol()(string)}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "eq(uint256,uint256)");
        for (const side of [a, b]) {
          const hashArgs = opReadOf(side, "hash(bytes)");
          expect(hashArgs).to.have.lengthOf(1);
          expect(staticCallOf(hashArgs[0]).target).to.equal(TOKEN);
        }
      },
    },
    {
      name: "compiles @hash! to hash judged EQ the expected digest",
      script: `assertions:assert @hash!(${TOKEN}::{name()(string)}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hashArgs = opReadOf(param, "hash(bytes)");
        expect(hashArgs).to.have.lengthOf(1);
        expect(staticCallOf(hashArgs[0]).target).to.equal(TOKEN);
        expectConstraint(
          param,
          "Eq",
          BigInt(
            "0x0102030405060708091011121314151617181920212223242526272829303132",
          ),
        );
      },
    },
    {
      name: "compiles a bare @str.includes! to lt(indexOf, byteLen) judged EQ 1",
      script: `assertions:assert @str.includes!(${TOKEN}::{name()(string)} "LP")`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "lt(uint256,uint256)");
        const haystack = expectIndexOf(a, "LP", 0n);
        expect(staticCallOf(haystack).target).to.equal(TOKEN);
        const lenArgs = opReadOf(b, "byteLen(bytes)");
        expect(lenArgs).to.have.lengthOf(1);
        expect(staticCallOf(lenArgs[0]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @str.includes! == false to an EQ 0 constraint",
      script: `assertions:assert @str.includes!(${TOKEN}::{name()(string)} "Sushi") == false "rebranded"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        expectConstraint(param, "Eq", 0n);
        const args = opReadOf(param, "lt(uint256,uint256)");
        expectIndexOf(args[0], "Sushi", 0n);
        expect(message).to.equal("rebranded");
      },
    },
    {
      name: "nests @str.includes! inside @bool! logic",
      script: `assertions:assert @bool!(@str.includes!(${TOKEN}::{name()(string)} "LP") and @str.charset!(${TOKEN}::{symbol()(string)} "a-z"))`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "bitAnd(uint256,uint256)");
        opReadOf(a, "lt(uint256,uint256)");
        opReadOf(
          b,
          "foldBytes(bytes,address,bytes,uint256,uint256,bytes32,uint8)",
        );
      },
    },
    {
      name: "compiles @str.charset! to a bitSet foldBytes with the class bitmap",
      script: `assertions:assert @str.charset!(${TOKEN}::{symbol()(string)} "a-z") == true`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(
          param,
          "foldBytes(bytes,address,bytes,uint256,uint256,bytes32,uint8)",
        );
        expect(args).to.have.lengthOf(2);
        // bits 97..122 = a-z
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.RawBytes);
        expect(args[0].paramData).to.equal(charsetLiteral(0x07fffffen << 96n));
        expect(staticCallOf(args[1]).target).to.equal(TOKEN);
        expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "@str.charset! treats a trailing dash as the literal `-`",
      script: `assertions:assert @str.charset!(${TOKEN}::{name()(string)} "a-z0-9-")`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(
          param,
          "foldBytes(bytes,address,bytes,uint256,uint256,bytes32,uint8)",
        );
        const expected = (0x07fffffen << 96n) | (0x3ffn << 48n) | (1n << 45n); // a-z | 0-9 | -
        expect(args[0].paramData).to.equal(charsetLiteral(expected));
      },
    },
    {
      name: "compiles @bytes.len! to byteLen of the decoded payload",
      script: `assertions:assert @bytes.len!(${TOKEN}::{payload()(bytes)}) == 2`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(param, "byteLen(bytes)");
        expect(args).to.have.lengthOf(1);
        expect(staticCallOf(args[0]).target).to.equal(TOKEN);
        expectConstraint(param, "Eq", 2n);
      },
    },
    // ---- @balance! --------------------------------------------------------
    {
      name: "compiles a native @balance! to the BALANCE fetcher",
      script: `assertions:assert @balance!(XDAI ${HOLDER}) > 1e18`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(param.fetcherType).to.equal(FETCHER_TYPE.Balance);
        expect(param.paramData).to.equal(
          encodePacked(["address", "address"], [zeroAddress, HOLDER]),
        );
        expectConstraint(param, "Gte", 10n ** 18n + 1n);
      },
    },
    {
      name: "resolves a token symbol in @balance! to the ERC-20 BALANCE fetcher",
      script: `assertions:assert @balance!(DAI ${HOLDER}) >= 10e18`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(param.fetcherType).to.equal(FETCHER_TYPE.Balance);
        expect(param.paramData).to.equal(
          encodePacked(["address", "address"], [DAI, HOLDER]),
        );
        expectConstraint(param, "Gte", 10n * 10n ** 18n);
      },
    },
    {
      name: "compiles a native @balance! of a call-resolved account to a spliced balance read",
      script: `assertions:assert @balance!(XDAI ${TOKEN}::{treasury()(address)}) >= 1e18`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(param, "balance(address)");
        expect(args).to.have.lengthOf(1);
        expect(staticCallOf(args[0]).target).to.equal(TOKEN);
        expectConstraint(param, "Gte", 10n ** 18n);
      },
    },
    // ---- @num! / @bool! composition ---------------------------------------
    {
      name: "compiles live addition through add",
      script: `assertions:assert @num!(@balance!(XDAI ${HOLDER}) + ${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}}) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 1n);
        const args = opReadOf(param, "add(uint256,uint256)");
        expect(args).to.have.lengthOf(2);
        expect(args[0].fetcherType).to.equal(FETCHER_TYPE.Balance);
        expect(staticCallOf(args[1]).target).to.equal(TOKEN);
      },
    },
    {
      name: "promotes mixed int operands to the int256 overloads",
      script: `assertions:assert @num!(${TOKEN}::{drift()(int256)} + 5) < 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a } = expectOpJudge(param, "lt(int256,int256)");
        opReadOf(a, "add(int256,int256)");
      },
    },
    {
      name: "compiles a bare @bool! or-expression to bitOr judged EQ 1",
      script: `assertions:assert @bool!((${TOKEN}::{supply()(uint256)} > 0) or (${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}} > 10))`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "bitOr(uint256,uint256)");
        opReadOf(a, "gt(uint256,uint256)");
        opReadOf(b, "gt(uint256,uint256)");
      },
    },
    {
      name: "compiles a bare @bool!(not …) to EQ 0 on the inner call",
      script: `assertions:assert @bool!(not ${TOKEN}::{paused()(bool)})`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(staticCallOf(param).target).to.equal(TOKEN);
        expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "left-folds variadic @min! into nested min calls",
      script: `assertions:assert @min!(${TOKEN}::{supply()(uint256)} ${TOKEN}::{cap()(uint256)} 5) <= 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Lte", 5n);
        const outer = opReadOf(param, "min(uint256,uint256)");
        expect(outer).to.have.lengthOf(2);
        const inner = opReadOf(outer[0], "min(uint256,uint256)");
        expect(inner).to.have.lengthOf(2);
        expectRawWord(outer[1], 5n);
      },
    },
    {
      name: "compiles @absdiff! to absDiff",
      script: `assertions:assert @absdiff!(${TOKEN}::{supply()(uint256)} 100) <= 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Lte", 5n);
        const args = opReadOf(param, "absDiff(uint256,uint256)");
        expect(args).to.have.lengthOf(2);
      },
    },
    {
      name: "judges two live sides with gt EQ 1",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} > ${TOKEN}::{cap()(uint256)}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "gt(uint256,uint256)");
        expect(staticCallOf(a).target).to.equal(TOKEN);
        expect(staticCallOf(b).target).to.equal(TOKEN);
      },
    },
    // ---- @bytes! / @not! ---------------------------------------------------
    {
      name: "compiles @bytes! bitwise-and through bitAnd",
      script: `assertions:assert @bytes!(${TOKEN}::{flags()(bytes32)} "&" 0x00000000000000000000000000000000000000000000000000000000000000ff) == 3`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 3n);
        const args = opReadOf(param, "bitAnd(uint256,uint256)");
        expect(staticCallOf(args[0]).target).to.equal(TOKEN);
        expectRawWord(args[1], 0xffn);
      },
    },
    {
      name: "folds a constant @bytes! shift at build time",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} < @bytes!(1 "<<" 128)`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Lte", (1n << 128n) - 1n);
      },
    },
    {
      name: "casts a live bool to its raw 0/1 word with single-arg @bytes!",
      script: `assertions:assert @num!(@bytes!(${TOKEN}::{paused()(bool)}) + 1) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(param, "add(uint256,uint256)");
        // The cast is free: the paused() call itself is the left operand.
        expect(staticCallOf(args[0]).target).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @not! on a live bool to EQ 0 on the inner call",
      script: `assertions:assert @not!(${TOKEN}::{paused()(bool)})`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(staticCallOf(param).target).to.equal(TOKEN);
        expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "compiles @not! on a numeric value to bitXor against all-ones",
      script: `assertions:assert @not!(${TOKEN}::{supply()(uint256)}) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 1n);
        const args = opReadOf(param, "bitXor(uint256,uint256)");
        expect(staticCallOf(args[0]).target).to.equal(TOKEN);
        expectRawWord(args[1], WORD_MASK);
      },
    },
    {
      name: "folds @not! on a bytes32 constant to its complement",
      script: `assertions:assert ${TOKEN}::{flags()(bytes32)} == @not!(0x00000000000000000000000000000000000000000000000000000000000000ff)`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", BigInt(`0x${"f".repeat(62)}00`));
      },
    },
    // ---- env getters -------------------------------------------------------
    {
      name: "compiles @chainid! to a plain chainId read at the operators",
      script: `assertions:assert @chainid! == 100 "wrong chain"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        expect(opsDirect(param)).to.equal(selectorOf("chainId()"));
        expectConstraint(param, "Eq", 100n);
        expect(message).to.equal("wrong chain");
      },
    },
    {
      name: "composes @chainid! inside arithmetic",
      script: `assertions:assert @num!(@chainid! + 1) > 100`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 101n);
        const args = opReadOf(param, "add(uint256,uint256)");
        expect(opsDirect(args[0])).to.equal(selectorOf("chainId()"));
        expectRawWord(args[1], 1n);
      },
    },
    {
      name: "compiles @basefee! to a plain baseFee read at the operators",
      script: `assertions:assert @basefee! <= 100e9 "basefee too high"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        expect(opsDirect(param)).to.equal(selectorOf("baseFee()"));
        expectConstraint(param, "Lte", 100n * 10n ** 9n);
        expect(message).to.equal("basefee too high");
      },
    },
    {
      name: "compiles @blockhash! of a live block number through the read splice",
      script: `assertions:assert @blockhash!(@blocknumber! - 1) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(param, "blockHash(uint256)");
        expect(args).to.have.lengthOf(1);
        const subArgs = opReadOf(args[0], "sub(uint256,uint256)");
        expect(opsDirect(subArgs[0])).to.equal(selectorOf("blockNumber()"));
        expectRawWord(subArgs[1], 1n);
        expectConstraint(
          param,
          "Eq",
          0x0102030405060708091011121314151617181920212223242526272829303132n,
        );
      },
    },
    {
      name: "fuses a * b / c into one 512-bit mulDiv read",
      script: `assertions:assert @num!(${TOKEN}::{supply()(uint256)} * 2 / 3) >= 1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(param, "mulDiv(uint256,uint256,uint256)");
        expect(args).to.have.lengthOf(3);
        expect(staticCallOf(args[0]).target).to.equal(TOKEN);
        expectRawWord(args[1], 2n);
        expectRawWord(args[2], 3n);
        expectConstraint(param, "Gte", 1n);
      },
    },
    {
      name: "keeps signed mul-then-div nested (no signed mulDiv)",
      script: `assertions:assert @num!(${TOKEN}::{supply()(int256)} * 2 / 3) >= 1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        // signed >= judges through ge(int256,int256) instead of a GTE
        // constraint, and the division stays div(mul(a, b), c)
        const { a, b } = expectOpJudge(param, "ge(int256,int256)");
        const divArgs = opReadOf(a, "div(int256,int256)");
        const mulArgs = opReadOf(divArgs[0], "mul(int256,int256)");
        expect(staticCallOf(mulArgs[0]).target).to.equal(TOKEN);
        expectRawWord(mulArgs[1], 2n);
        expectRawWord(divArgs[1], 3n);
        expectRawWord(b, 1n);
      },
    },
    {
      name: "compiles @sqrt! over a fused reserve product",
      script: `assertions:assert @sqrt!(${TOKEN}::{supply()(uint256)} * ${TOKEN}::{supply()(uint256)}) >= 4`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(param, "sqrt(uint256)");
        expect(args).to.have.lengthOf(1);
        const mulArgs = opReadOf(args[0], "mul(uint256,uint256)");
        expect(staticCallOf(mulArgs[0]).target).to.equal(TOKEN);
        expectConstraint(param, "Gte", 4n);
      },
    },
    {
      name: "coerces a live string operand in arithmetic through parseUint",
      script: `assertions:assert @num!(@str.split!(${TOKEN}::{name()(string)} " " 0) + 1) >= 2`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const addArgs = opReadOf(param, "add(uint256,uint256)");
        const parseArgs = opReadOf(addArgs[0], "parseUint(bytes)");
        expect(parseArgs).to.have.lengthOf(1);
        expectSlice(parseArgs[0]);
        expectRawWord(addArgs[1], 1n);
        expectConstraint(param, "Gte", 2n);
      },
    },
    {
      name: "picks the arithmetic shift for >> on a signed value",
      script: `assertions:assert @bytes!(${TOKEN}::{supply()(int256)} ">>" 2) == 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const args = opReadOf(param, "shr(int256,uint256)");
        expect(staticCallOf(args[0]).target).to.equal(TOKEN);
        expectRawWord(args[1], 2n);
        expectConstraint(param, "Eq", 0n);
      },
    },
    {
      name: "compiles @codehash! of a literal address to plain codehash calldata",
      script: `assertions:assert @codehash!(${TOKEN}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expect(opsDirect(param)).to.equal(
          `${selectorOf("codehash(address)")}${word(BigInt(TOKEN)).slice(2)}`,
        );
        expectConstraint(
          param,
          "Eq",
          BigInt(
            "0x0102030405060708091011121314151617181920212223242526272829303132",
          ),
        );
      },
    },
    {
      name: "compiles @codehash! of a call-resolved address to a spliced codehash read",
      script: `assertions:assert @codehash!(${TOKEN}::{implementation()(address)}) != 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "ne(uint256,uint256)");
        const args = opReadOf(a, "codehash(address)");
        expect(args).to.have.lengthOf(1);
        const call = staticCallOf(args[0]);
        expect(call.target).to.equal(TOKEN);
        expect(call.data).to.equal(selectorOf("implementation()"));
        expectRawWord(
          b,
          BigInt(
            "0x0102030405060708091011121314151617181920212223242526272829303132",
          ),
        );
      },
    },
    {
      name: "judges two live @codehash! sides with eq",
      script: `assertions:assert @codehash!(${TOKEN}) == @codehash!(${HOLDER})`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectOpJudge(param, "eq(uint256,uint256)");
        expect(opsDirect(a)).to.equal(
          `${selectorOf("codehash(address)")}${word(BigInt(TOKEN)).slice(2)}`,
        );
        expect(opsDirect(b)).to.equal(
          `${selectorOf("codehash(address)")}${word(BigInt(HOLDER)).slice(2)}`,
        );
      },
    },
    // ---- nested live call arguments ----------------------------------------
    {
      name: "compiles a nested call argument to a core read",
      script: `assertions:assert ${A}::{a(address)(uint256) ${B}::{b()(address)}} == 7`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 7n);
        const { target, selector, segments } = readOf(param);
        expectRawWord(target, BigInt(A));
        expect(selector).to.equal(selectorOf("a(address)"));
        // One segment: the live b() call, its 32-byte word IS the argument.
        expect(segments).to.have.lengthOf(1);
        const bCall = staticCallOf(segments[0]);
        expect(bCall.target).to.equal(B);
        expect(bCall.data).to.equal(selectorOf("b()"));
      },
    },
    {
      name: "compiles example 1: two read levels with a lens on the outer call",
      script: `assertions:assert ${A}::{a(address)(uint256,uint256[]) ${B}::{b(uint256,uint256)(address) ${C}::{c(address)(uint256) ${ME}} ${D}::{d()(uint256)}}}[_ [$]] == 7 "nested"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        expect(message).to.equal("nested");
        expectConstraint(param, "Eq", 7n);

        // The judged value: nav with the lens [_ [$]] (path [1, 0]) over
        // the read that constructs a(<b>).
        const nav = core(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(uint256,uint256[])");
        expect(nav.args[2]).to.deep.equal([1n, 0n]);

        const aRead = readOf(nav.args[0] as unknown as Param);
        expectRawWord(aRead.target, BigInt(A));
        expect(aRead.selector).to.equal(selectorOf("a(address)"));
        expect(aRead.segments).to.have.lengthOf(1);

        // Nested level: the read constructing b(<c>, <d>) — two live
        // word segments, no literal spans between them.
        const bRead = readOf(aRead.segments[0]);
        expectRawWord(bRead.target, BigInt(B));
        expect(bRead.selector).to.equal(selectorOf("b(uint256,uint256)"));
        expect(bRead.segments).to.have.lengthOf(2);
        const cCall = staticCallOf(bRead.segments[0]);
        expect(cCall.target).to.equal(C);
        expect(cCall.data).to.equal(
          `${selectorOf("c(address)")}${word(BigInt(ME)).slice(2)}`,
        );
        const dCall = staticCallOf(bRead.segments[1]);
        expect(dCall.target).to.equal(D);
        expect(dCall.data).to.equal(selectorOf("d()"));
      },
    },
    {
      name: "compiles example 2: a nav-backed dynamic lens as a word segment",
      script: `assertions:assert ${A}::{a(address)(uint256) ${B}::{b()(address,address[][])}[_ [_ [$]]]} == 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 5n);
        const { target, selector, segments } = readOf(param);
        expectRawWord(target, BigInt(A));
        expect(selector).to.equal(selectorOf("a(address)"));
        expect(segments).to.have.lengthOf(1);
        // The word segment is the nav over b()'s (address,address[][]) return.
        const nav = core(segments[0]);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address,address[][])");
        expect(nav.args[2]).to.deep.equal([1n, 1n, 0n]);
        const bCall = staticCallOf(nav.args[0] as unknown as Param);
        expect(bCall.target).to.equal(B);
        expect(bCall.data).to.equal(selectorOf("b()"));
      },
    },
    {
      name: "compiles example 2 (dynamic envelope): an address[] argument as the trailing segment",
      script: `assertions:assert ${A}::{a(address[])(uint256) ${B}::{b()(address,address[][])}[_ [_ $]]} == 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 5n);
        const { target, selector, segments } = readOf(param);
        expectRawWord(target, BigInt(A));
        expect(selector).to.equal(selectorOf("a(address[])"));

        // Two segments: the literal head (offset 64 skips the envelope's
        // own offset word) and the nav whose envelope the judge appends.
        expect(segments).to.have.lengthOf(2);
        expectRawWord(segments[0], 64n);
        const nav = core(segments[1]);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address,address[][])");
        expect(nav.args[2]).to.deep.equal([1n, 1n]);
        expect(staticCallOf(nav.args[0] as unknown as Param).target).to.equal(
          B,
        );
      },
    },
    {
      name: "splits a chain around a live-arg hop: the read becomes the next hop's start",
      script: `assertions:assert ${A}::{f(uint256)(address) ${B}::{g()(uint256)}}::{h()(uint256)} == 1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 1n);
        const chain = core(param);
        expect(chain.functionName).to.equal("chain");
        expect(chain.args[1]).to.deep.equal([selectorOf("h()")]);
        const read = readOf(chain.args[0] as unknown as Param);
        expectRawWord(read.target, BigInt(A));
        expect(read.selector).to.equal(selectorOf("f(uint256)"));
        expect(read.segments).to.have.lengthOf(1);
        const g = staticCallOf(read.segments[0]);
        expect(g.target).to.equal(B);
        expect(g.data).to.equal(selectorOf("g()"));
      },
    },
    {
      name: "compiles a dynamic envelope inside a nested (non-outermost) call",
      script: `assertions:assert ${A}::{a(uint256)(uint256) ${B}::{b(address[])(uint256) ${C}::{c()(address,address[][])}[_ [_ $]]}} == 1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 1n);
        const aRead = readOf(param);
        expect(aRead.selector).to.equal(selectorOf("a(uint256)"));
        expect(aRead.segments).to.have.lengthOf(1);
        const bRead = readOf(aRead.segments[0]);
        expect(bRead.selector).to.equal(selectorOf("b(address[])"));
        expect(bRead.segments).to.have.lengthOf(2);
        expectRawWord(bRead.segments[0], 64n);
        const nav = core(bRead.segments[1]);
        expect(nav.functionName).to.equal("nav");
        expect(staticCallOf(nav.args[0] as unknown as Param).target).to.equal(
          C,
        );
      },
    },
    {
      name: "compiles two dynamic envelopes in different nested calls",
      script: `assertions:assert ${A}::{a(uint256,uint256)(uint256) ${B}::{b(address[])(uint256) ${C}::{c()(address,address[][])}[_ [_ $]]} ${B}::{b(address[])(uint256) ${C}::{c()(address,address[][])}[_ [_ $]]}} == 1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const aRead = readOf(param);
        expect(aRead.selector).to.equal(selectorOf("a(uint256,uint256)"));
        expect(aRead.segments).to.have.lengthOf(2);
        for (const segment of aRead.segments) {
          const bRead = readOf(segment);
          expect(bRead.selector).to.equal(selectorOf("b(address[])"));
          expect(bRead.segments).to.have.lengthOf(2);
        }
      },
    },
    // ---- !::{} on-chain read hops -----------------------------------------
    {
      name: "compiles !:: with a literal target and constant argument",
      script: `assertions:assert ${TOKEN}!::{balanceOf(address)(uint256) ${HOLDER}} >= 10e18`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 10n * 10n ** 18n);
        const { target, selector, segments } = readOf(param);
        expectRawWord(target, BigInt(TOKEN));
        expect(selector).to.equal(selectorOf("balanceOf(address)"));
        expect(segments).to.have.lengthOf(1);
        expectRawWord(segments[0], BigInt(HOLDER));
      },
    },
    {
      name: "compiles !:: with a call-resolved target",
      script: `assertions:assert ${A}::{asset()(address)}!::{totalSupply()(uint256)} > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { target, selector, segments } = readOf(param);
        const assetCall = staticCallOf(target);
        expect(assetCall.target).to.equal(A);
        expect(assetCall.data).to.equal(selectorOf("asset()"));
        expect(selector).to.equal(selectorOf("totalSupply()"));
        expect(segments).to.have.lengthOf(0);
      },
    },
    {
      name: "compiles !:: with a live call argument",
      script: `assertions:assert ${A}!::{convertToAssets(uint256)(uint256) ${B}::{totalSupply()(uint256)}} > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { target, selector, segments } = readOf(param);
        expectRawWord(target, BigInt(A));
        expect(selector).to.equal(selectorOf("convertToAssets(uint256)"));
        expect(segments).to.have.lengthOf(1);
        const supplyCall = staticCallOf(segments[0]);
        expect(supplyCall.target).to.equal(B);
        expect(supplyCall.data).to.equal(selectorOf("totalSupply()"));
      },
    },
    {
      name: "composes a !:: read inside @num! arithmetic",
      script: `assertions:assert @num!(${A}!::{convertToAssets(uint256)(uint256) 1e18} * 2) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        // Unsigned `> 0` folds to a GTE 1 constraint on the expression.
        expectConstraint(param, "Gte", 1n);
        const args = opReadOf(param, "mul(uint256,uint256)");
        const read = readOf(args[0]);
        expect(read.selector).to.equal(selectorOf("convertToAssets(uint256)"));
        expect(read.segments).to.have.lengthOf(1);
        expectRawWord(read.segments[0], 10n ** 18n);
        expectRawWord(args[1], 2n);
      },
    },
    {
      name: "judges a string-returning !:: read via keccak of the payload",
      script: `assertions:assert ${TOKEN}!::{name()(string)} == "Wrapped Ether"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", BigInt(stringDigest("Wrapped Ether")));
        const hashArgs = opReadOf(param, "hash(bytes)");
        const read = readOf(hashArgs[0]);
        expect(read.selector).to.equal(selectorOf("name()"));
      },
    },
    {
      name: "reads from a computed head (@bytes! word) via !::",
      script: `assertions:assert @bytes!(${C}::{packedPool()(uint256)} ">>" 96)!::{fee()(uint24)} > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        // fee() read whose target is the shifted packedPool word.
        const { target, selector, segments } = readOf(param);
        expect(selector).to.equal(selectorOf("fee()"));
        expect(segments).to.have.lengthOf(0);
        const shr = opReadOf(target, "shr(uint256,uint256)");
        expect(shr).to.have.lengthOf(2);
        const pool = staticCallOf(shr[0]);
        expect(pool.target).to.equal(C);
        expect(pool.data).to.equal(selectorOf("packedPool()"));
        expectRawWord(shr[1], 96n);
      },
    },
    {
      name: "accepts a single-word non-address value as a !:: read target",
      script: `assertions:assert ${TOKEN}::{decimals()(uint256)}!::{totalSupply()(uint256)} > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { target, selector } = readOf(param);
        const decimalsCall = staticCallOf(target);
        expect(decimalsCall.target).to.equal(TOKEN);
        expect(decimalsCall.data).to.equal(selectorOf("decimals()"));
        expect(selector).to.equal(selectorOf("totalSupply()"));
      },
    },
    {
      name: "applies a destructure lens to a !:: read via pick",
      script: `assertions:assert ${A}!::{getReserves()(uint112,uint112)}[$ _] > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const pick = core(param);
        expect(pick.functionName).to.equal("pick");
        const read = readOf(pick.args[0] as unknown as Param);
        expect(read.selector).to.equal(selectorOf("getReserves()"));
        expect(pick.args[1]).to.equal(0n);
      },
    },
  ],
  errorCases: [
    {
      name: "rejects an unknown on-chain helper",
      script: `assertions:assert @frobnicate!(${TOKEN}::{value()(uint256)}) == 1`,
      error: "unknown on-chain helper",
    },
    {
      name: "rejects a lens step into a non-composite value",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[_ [$]] == ${HOLDER}`,
      error: "cannot select into a address value",
    },
    {
      name: "rejects a mid-chain nested lens landing on a non-address",
      script: `assertions:assert ${TOKEN}::{proposals()((address,uint256,bool)[])}[[_ $]]::{decimals()(uint256)} == 18`,
      error: "must continue on an address",
    },
    {
      name: "rejects a lens with two rest markers on one level",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[... $ ...] >= 1000`,
      error: "at most one ... per nesting level",
    },
    {
      name: "rejects an end-anchored index past the start of the returns",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[... $ _ _ _] >= 1000`,
      error: "out of range",
    },
    {
      name: "rejects a value lens landing on a struct",
      script: `assertions:assert ${TOKEN}::{proposals()((address,uint256,bool)[])}[[_ $]] == 1`,
      error: "must select a single value",
    },
    {
      name: "rejects @len! over a lens selecting a word",
      script: `assertions:assert @len!(${TOKEN}::{signers()(address[],address)}[_ $]) > 0`,
      error: "must select a single value",
    },
    {
      name: "rejects @hash! over a non-bytes return",
      script: `assertions:assert @hash!(${TOKEN}::{holders()(address[])}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      error: "needs a string or bytes value",
    },
    {
      name: "rejects @bytes.len! over a non-bytes return",
      script: `assertions:assert @bytes.len!(${TOKEN}::{holders()(address[])}) == 128`,
      error: "needs a string or bytes value",
    },
    {
      name: "rejects an empty @str.includes! part",
      script: `assertions:assert @str.includes!(${TOKEN}::{name()(string)} "")`,
      error: "@str.includes! part must be a non-empty string",
    },
    {
      name: "rejects a reversed @str.charset! range",
      script: `assertions:assert @str.charset!(${TOKEN}::{symbol()(string)} "z-a")`,
      error: "the range is reversed",
    },
    {
      name: "rejects an assertion where both sides are constants",
      script: `assertions:assert 10 >= 5`,
      error: "nothing to assert on-chain",
    },
    {
      name: "rejects an unsupported operator for an address return",
      script: `assertions:assert ${TOKEN}::{owner()(address)} >= ${HOLDER}`,
      error: "not supported",
    },
    {
      name: "requires a --delta for the ~= operator",
      script: `assertions:assert ${TOKEN}::{price()(uint256)} ~= 2000`,
      error: "requires a --delta",
    },
    {
      name: "rejects unwrapped top-level infix with a wrap hint",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} + 1 > 0`,
      error: "wrap arithmetic in @num!",
    },
    {
      name: "rejects ~= between two live values",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} ~= ${TOKEN}::{cap()(uint256)} --delta 5`,
      error: "@absdiff!",
    },
    {
      name: "rejects ~= on a string return",
      script: `assertions:assert ${TOKEN}::{name()(string)} ~= "x" --delta 1`,
      error: "not supported",
    },
    {
      name: "rejects comparing an unsigned return against a negative value",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} >= -5`,
      error: "negative value",
    },
    {
      name: "rejects an ERC-20 @balance! of a call-resolved account",
      script: `assertions:assert @balance!(DAI ${TOKEN}::{treasury()(address)}) > 0`,
      error: "only supports the native token",
    },
    {
      name: "detects missing spaces around operators",
      script: `assertions:assert @num!(supply+1) > 0`,
      error: "Missing spaces around operator",
    },
    {
      name: "rejects on-chain helpers outside an assertion",
      script: `set $x @assertions:timestamp!`,
      error: "only valid inside an on-chain expression",
    },
    {
      name: "rejects @chainid! with arguments",
      script: `assertions:assert @chainid!(1) == 100`,
      error: "@chainid! takes no arguments",
    },
    {
      name: "rejects a non-address @codehash! account",
      script: `assertions:assert @codehash!(123) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      error: "must resolve to an address",
    },
    {
      name: "rejects a @codehash! call not returning a single address",
      script: `assertions:assert @codehash!(${TOKEN}::{decimals()(uint256)}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      error: "must return a single address",
    },
    {
      name: "rejects an ordering comparison on @codehash!",
      script: `assertions:assert @codehash!(${TOKEN}) > 0x0102030405060708091011121314151617181920212223242526272829303132`,
      error: "not supported",
    },
    {
      name: "rejects an unknown @bytes! operator",
      script: `assertions:assert @bytes!(${TOKEN}::{supply()(uint256)} "+" 1) > 0`,
      error: '@bytes! operator must be one of "&" "|" "^" "<<" ">>"',
    },
    {
      name: "rejects @bytes! on a string return",
      script: `assertions:assert @bytes!(${TOKEN}::{name()(string)}) > 0`,
      error: "needs 32-byte word operands",
    },
    {
      name: "rejects @not! on a string return",
      script: `assertions:assert @not!(${TOKEN}::{name()(string)})`,
      error: "needs a boolean or 32-byte word operand",
    },
    {
      name: "rejects @str.split! without its index",
      script: `assertions:assert @str.split!(${TOKEN}::{name()(string)} " ") == "LP"`,
      error: "@str.split! expects (call delimiter index)",
    },
    {
      name: "rejects @str.split! as the call of another chain helper",
      script: `assertions:assert @bytes.len!(@str.split!(${TOKEN}::{name()(string)} " " 1)) == 32`,
      error: "expects a `::` call expression",
    },
    {
      name: "rejects ordering comparisons on strings",
      script: `assertions:assert @bool!(@str.split!(${TOKEN}::{name()(string)} " " 0) > "A")`,
      error: "strings only support == and !=",
    },
    {
      name: "rejects arithmetic operators inside @bool!",
      script: `assertions:assert @bool!(${TOKEN}::{supply()(uint256)} + 1)`,
      error: "Use @num!",
    },
    {
      name: "rejects a mid-chain lens that selects a non-address",
      script: `assertions:assert ${TOKEN}::{poolInfo()(uint112,uint112,address)}[$ _ _]::{symbol()(string)} == "WETH"`,
      error: "must continue on an address",
    },
    {
      name: "rejects a multi-value intermediate hop without a lens",
      script: `assertions:assert ${TOKEN}::{poolInfo()(uint112,uint112,address)}::{symbol()(string)} == "WETH"`,
      error: "select one with a lens",
    },
    // ---- !::{} on-chain read hops -----------------------------------------
    {
      name: "rejects a multi-return !:: read without a lens",
      script: `assertions:assert ${TOKEN}!::{getReserves()(uint112,uint112)} > 0`,
      error: "use a destructure lens to select one",
    },
    {
      name: "rejects a non-address constant !:: read target",
      script: `assertions:assert 123!::{totalSupply()(uint256)} > 0`,
      error: "must resolve to an address",
    },
    {
      name: "rejects a multi-word value as a !:: read target",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112)}!::{totalSupply()(uint256)} > 0`,
      error: "must be a single-word value",
    },
    {
      name: "rejects a !:: argument-count mismatch",
      script: `assertions:assert ${TOKEN}!::{balanceOf(address)(uint256)} > 0`,
      error: "expects 1 argument",
    },
    {
      name: "rejects !:: outside an assertion",
      script: `set $x ${TOKEN}!::{totalSupply()(uint256)}`,
      error: "only valid inside an on-chain expression",
    },
    // ---- nested live call arguments ----------------------------------------
    {
      name: "rejects a word-typed nested call argument with a mismatched type",
      script: `assertions:assert ${A}::{a(uint256)(uint256) ${B}::{b()(address)}} == 1`,
      error: "resolves a address value",
    },
    {
      name: "rejects a dynamic nested argument that is not the last argument",
      script: `assertions:assert ${A}::{a(address[],uint256)(uint256) ${B}::{b()(address,address[][])}[_ [_ $]] 1} == 1`,
      error: "must be the last argument",
    },
    {
      name: "rejects two dynamic nested arguments",
      script: `assertions:assert ${A}::{a(address[],address[])(uint256) ${B}::{b()(address,address[][])}[_ [_ $]] ${B}::{b()(address,address[][])}[_ [_ $]]} == 1`,
      error: "only one dynamic-typed nested call argument",
    },
    {
      name: "rejects a dynamic nested argument with a mismatched envelope type",
      script: `assertions:assert ${A}::{a(uint256[])(uint256) ${B}::{b()(address,address[][])}[_ [_ $]]} == 1`,
      error: "adjust the lens to select a matching value",
    },
  ],
});

// Without overrides the module targets the canonical deployments.
describeCommand("assert", {
  describeName: "Assertions > commands > assert (canonical addresses)",
  preamble: "load assertions",
  cases: [
    {
      name: "defaults to the canonical core v2 address",
      script: `assertions:assert ${TOKEN}::{paused()(bool)}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions, ASSERTIONS_ADDRESS);
        expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "defaults to the canonical operators v1 address",
      script: `assertions:assert @chainid! == 100`,
      validate: (actions) => {
        const { param } = decodeAssert(actions, ASSERTIONS_ADDRESS);
        expect(opsDirect(param, OPERATORS_ADDRESS)).to.equal(
          selectorOf("chainId()"),
        );
        expectConstraint(param, "Eq", 100n);
      },
    },
  ],
});
