import "../../setup";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
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
  COMBINATORS_ADDRESS,
} from "../../../src/lib/assertions";
import {
  CALC_OP,
  COMBINATORS_ABI,
  DATA_OP,
  ENV_OP,
  LEN_STEP,
  UNARY_OP,
} from "../../../src/lib/combinators";
import {
  ASSERTIONS_ABI,
  CONSTRAINT_TYPE,
  FETCHER_TYPE,
} from "../../../src/lib/erc8211";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const COMBINATORS = getAddress("0x00000000000000000000000000000000c0b1a705");
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

const preamble = `load assertions\nset $assertions:address ${ASSERTIONS}\nset $assertions:combinators ${COMBINATORS}`;

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

function selectorOf(signature: string): string {
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

/** Decode a param as a combinator call (STATIC_CALL to the combinators). */
function combinator(param: Param, at: Address = COMBINATORS) {
  const { target, data } = staticCallOf(param);
  expect(target).to.equal(at);
  return decodeFunctionData({ abi: COMBINATORS_ABI, data });
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

/** `calc(op, live, word)` judged EQ 1 — the shape != and signed
 *  comparisons compile to. */
function expectCalcJudge(param: Param, op: number): { a: Param; b: Param } {
  expectConstraint(param, "Eq", 1n);
  const calc = combinator(param);
  expect(calc.functionName).to.equal("calc");
  expect(calc.args[0]).to.equal(op);
  return {
    a: calc.args[1] as unknown as Param,
    b: calc.args[2] as unknown as Param,
  };
}

function expectRawWord(param: Param, value: bigint) {
  expect(param.fetcherType).to.equal(FETCHER_TYPE.RawBytes);
  expect(BigInt(param.paramData)).to.equal(value & WORD_MASK);
}

const stringDigest = (s: string) =>
  keccak256(encodeAbiParameters([{ type: "string" }], [s]));

/** Decode a param as combinators.invoke: the runtime-resolved target, the
 *  4-byte selector and the calldata segments the judge concatenates. */
function invokeOf(param: Param): {
  target: Param;
  selector: `0x${string}`;
  segments: readonly Param[];
} {
  const call = combinator(param);
  expect(call.functionName).to.equal("invoke");
  return {
    target: call.args[0] as unknown as Param,
    selector: call.args[1] as `0x${string}`,
    segments: call.args[2] as unknown as readonly Param[],
  };
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
        const pick = combinator(param);
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
        const nav = combinator(param);
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
        const nav = combinator(param);
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
        const nav = combinator(param);
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
        const { a, b } = expectCalcJudge(param, CALC_OP.Gt);
        const element = combinator(a);
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
        const nav = combinator(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address[][])");
        expect(nav.args[2]).to.deep.equal([0n, 1n, LEN_STEP]);
        expectConstraint(param, "Gte", 3n);
      },
    },
    {
      name: "compiles @split! over a lensed struct-array string field",
      script: `assertions:assert @split!(${TOKEN}::{items()((string,uint256)[])}[[[$ _]]] " " -1) == "LP"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        // string == constant → data(Hash) of the split judged EQ digest
        const hash = combinator(param);
        expect(hash.functionName).to.equal("data");
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        const split = combinator(hash.args[1] as unknown as Param);
        expect(split.functionName).to.equal("data");
        expect(split.args[0]).to.equal(DATA_OP.Split);
        const lensed = combinator(split.args[1] as unknown as Param);
        expect(lensed.functionName).to.equal("nav");
        expect(lensed.args[1]).to.equal("((string,uint256)[])");
        expect(lensed.args[2]).to.deep.equal([0n, 0n, 0n]);
        expect(split.args[2]).to.equal(stringToHex(" "));
        expect(split.args[3]).to.equal(-1n);
        expectConstraint(param, "Eq", BigInt(stringDigest("LP")));
      },
    },
    {
      name: "resolves a rest-lens over a known-arity return at build time",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[... $ _] >= 1000 "low reserve"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const pick = combinator(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(1n);
      },
    },
    {
      name: "resolves a fixed-array element lens (end-anchored) at build time",
      script: `assertions:assert ${TOKEN}::{config()(address,address[2])}[_ [... $]] == ${HOLDER}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = combinator(param);
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
        const nav = combinator(param);
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
      name: "routes an int256 comparison through the signed calc variant",
      script: `assertions:assert ${TOKEN}::{drift()(int256)} <= -5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.SLe);
        expect(staticCallOf(a).target).to.equal(TOKEN);
        expectRawWord(b, -5n);
      },
    },
    {
      name: "judges a tuple-indexed int256 equality directly (words compare exactly)",
      script: `assertions:assert ${TOKEN}::{pair()(int256,uint256)}[$ _] == -1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const pick = combinator(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(0n);
        expectConstraint(param, "Eq", -1n);
      },
    },
    {
      name: "compiles ~= on an int return to calc(SAbsDiff) LTE delta",
      script: `assertions:assert ${TOKEN}::{drift()(int256)} ~= -100 --delta 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Lte", 5n);
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.SAbsDiff);
        expectRawWord(calc.args[2] as unknown as Param, -100n);
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
        const pick = combinator(param);
        expect(pick.functionName).to.equal("pick");
        expect(pick.args[1]).to.equal(0n);
        expectConstraint(param, "Eq", 0n);
      },
    },
    // ---- strings and bytes ----------------------------------------------
    {
      name: "judges a string equality via data(Hash) against the envelope digest",
      script: `assertions:assert ${TOKEN}::{name()(string)} == "Wrapped Ether"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hash = combinator(param);
        expect(hash.functionName).to.equal("data");
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        expect(staticCallOf(hash.args[1] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expectConstraint(param, "Eq", BigInt(stringDigest("Wrapped Ether")));
      },
    },
    {
      name: "compiles a string != to calc(Ne) over the digest",
      script: `assertions:assert ${TOKEN}::{name()(string)} != "Foo"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Ne);
        const hash = combinator(a);
        expect(hash.functionName).to.equal("data");
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        expectRawWord(b, BigInt(stringDigest("Foo")));
      },
    },
    {
      name: "judges a bytes equality via data(Hash) of the bytes envelope",
      script: `assertions:assert ${TOKEN}::{payload()(bytes)} == 0x1234`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hash = combinator(param);
        expect(hash.functionName).to.equal("data");
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        expectConstraint(
          param,
          "Eq",
          BigInt(
            keccak256(encodeAbiParameters([{ type: "bytes" }], ["0x1234"])),
          ),
        );
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
    // ---- :: chains → chain combinator ------------------------------------
    {
      name: "compiles a :: chain through Combinators.chain",
      script: `assertions:assert ${TOKEN}::{vault()(address)}::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hash = combinator(param);
        expect(hash.functionName).to.equal("data");
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        const chain = combinator(hash.args[1] as unknown as Param);
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
        const hash = combinator(param);
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        const chain = combinator(hash.args[1] as unknown as Param);
        expect(chain.functionName).to.equal("chain");
        // The mid-chain lens wraps the prefix in pick(word 2) as the start.
        const pick = combinator(chain.args[0] as unknown as Param);
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
        const chain = combinator(param);
        expect(chain.functionName).to.equal("chain");
        const nav = combinator(chain.args[0] as unknown as Param);
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
        const nav = combinator(param);
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
      name: "supports != on @len! via calc(Ne) judged EQ 1",
      script: `assertions:assert @len!(${TOKEN}::{holders()(address[])}) != 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Ne);
        expect(combinator(a).functionName).to.equal("nav");
        expectRawWord(b, 0n);
      },
    },
    {
      name: "routes a chained @len! argument through the chain combinator",
      script: `assertions:assert @len!(${TOKEN}::{vault()(address)}::{holders()(address[])}) == 2`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const nav = combinator(param);
        expect(nav.functionName).to.equal("nav");
        const chain = combinator(nav.args[0] as unknown as Param);
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
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Mul);
        const left = combinator(calc.args[1] as unknown as Param);
        expect(left.functionName).to.equal("nav");
        expect(left.args[1]).to.equal("(address[])");
        expect(left.args[2]).to.deep.equal([0n, LEN_STEP]);
        expectRawWord(calc.args[2] as unknown as Param, 2n);
      },
    },
    // ---- other chain-call helpers -----------------------------------------
    {
      name: "compiles @split! to data(Split) hashed for the string equality",
      script: `assertions:assert @split!(${TOKEN}::{name()(string)} " " 1) == "LP"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hash = combinator(param);
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        const split = combinator(hash.args[1] as unknown as Param);
        expect(split.functionName).to.equal("data");
        expect(split.args[0]).to.equal(DATA_OP.Split);
        expect(staticCallOf(split.args[1] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expect(split.args[2]).to.equal(stringToHex(" "));
        expect(split.args[3]).to.equal(1n);
        expectConstraint(param, "Eq", BigInt(stringDigest("LP")));
      },
    },
    {
      name: "compiles a negative @split! index for from-the-end selection",
      script: `assertions:assert @split!(${TOKEN}::{name()(string)} " " -1) == "Token"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const hash = combinator(param);
        const split = combinator(hash.args[1] as unknown as Param);
        expect(split.args[0]).to.equal(DATA_OP.Split);
        expect(split.args[3]).to.equal(-1n);
        expectConstraint(param, "Eq", BigInt(stringDigest("Token")));
      },
    },
    {
      name: "compiles a nested string equality to an on-chain keccak comparison",
      script: `assertions:assert @bool!(@split!(${TOKEN}::{name()(string)} " " -1) == "LP")`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Eq);
        const live = combinator(a);
        expect(live.functionName).to.equal("data");
        expect(live.args[0]).to.equal(DATA_OP.Hash);
        const wrapped = combinator(live.args[1] as unknown as Param);
        expect(wrapped.functionName).to.equal("data");
        expect(wrapped.args[0]).to.equal(DATA_OP.Split);
        expectRawWord(b, BigInt(stringDigest("LP")));
      },
    },
    {
      name: "compiles two live strings to a keccak-vs-keccak comparison",
      script: `assertions:assert ${TOKEN}::{name()(string)} == ${TOKEN}::{symbol()(string)}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Eq);
        for (const side of [a, b]) {
          const hash = combinator(side);
          expect(hash.functionName).to.equal("data");
          expect(hash.args[0]).to.equal(DATA_OP.Hash);
          expect(
            staticCallOf(hash.args[1] as unknown as Param).target,
          ).to.equal(TOKEN);
        }
      },
    },
    {
      name: "compiles @hash! to data(Hash) judged EQ the expected digest",
      script: `assertions:assert @hash!(${TOKEN}::{name()(string)}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Hash);
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
      name: "compiles a bare @includes! to data(Includes) judged EQ 1",
      script: `assertions:assert @includes!(${TOKEN}::{name()(string)} "LP")`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Includes);
        expect(staticCallOf(inner.args[1] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expect(inner.args[2]).to.equal(stringToHex("LP"));
        expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "compiles @includes! == false to an EQ 0 constraint",
      script: `assertions:assert @includes!(${TOKEN}::{name()(string)} "Sushi") == false "rebranded"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.args[0]).to.equal(DATA_OP.Includes);
        expect(inner.args[2]).to.equal(stringToHex("Sushi"));
        expectConstraint(param, "Eq", 0n);
        expect(message).to.equal("rebranded");
      },
    },
    {
      name: "nests @includes! inside @bool! logic",
      script: `assertions:assert @bool!(@includes!(${TOKEN}::{name()(string)} "LP") and @charset!(${TOKEN}::{symbol()(string)} "a-z"))`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.And);
        const left = combinator(a);
        expect(left.functionName).to.equal("data");
        expect(left.args[0]).to.equal(DATA_OP.Includes);
        const right = combinator(b);
        expect(right.functionName).to.equal("data");
        expect(right.args[0]).to.equal(DATA_OP.Charset);
      },
    },
    {
      name: "compiles @charset! to data(Charset) with the class bitmap",
      script: `assertions:assert @charset!(${TOKEN}::{symbol()(string)} "a-z") == true`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Charset);
        // bits 97..122 = a-z
        expect(inner.args[2]).to.equal(
          numberToHex(0x07fffffen << 96n, { size: 32 }),
        );
        expectConstraint(param, "Eq", 1n);
      },
    },
    {
      name: "@charset! treats a trailing dash as the literal `-`",
      script: `assertions:assert @charset!(${TOKEN}::{name()(string)} "a-z0-9-")`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.args[0]).to.equal(DATA_OP.Charset);
        const expected = (0x07fffffen << 96n) | (0x3ffn << 48n) | (1n << 45n); // a-z | 0-9 | -
        expect(inner.args[2]).to.equal(numberToHex(expected, { size: 32 }));
      },
    },
    {
      name: "compiles @bytelen! to data(ByteLen)",
      script: `assertions:assert @bytelen!(${TOKEN}::{holders()(address[])}) == 128`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.ByteLen);
        expectConstraint(param, "Eq", 128n);
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
      name: "compiles a native @balance! of a call-resolved account to unary(Balance)",
      script: `assertions:assert @balance!(XDAI ${TOKEN}::{treasury()(address)}) >= 1e18`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("unary");
        expect(inner.args[0]).to.equal(UNARY_OP.Balance);
        expect(staticCallOf(inner.args[1] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expectConstraint(param, "Gte", 10n ** 18n);
      },
    },
    // ---- @num! / @bool! composition ---------------------------------------
    {
      name: "compiles live addition through calc(Add)",
      script: `assertions:assert @num!(@balance!(XDAI ${HOLDER}) + ${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}}) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 1n);
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Add);
        const left = calc.args[1] as unknown as Param;
        expect(left.fetcherType).to.equal(FETCHER_TYPE.Balance);
        expect(staticCallOf(calc.args[2] as unknown as Param).target).to.equal(
          TOKEN,
        );
      },
    },
    {
      name: "promotes mixed int operands to the signed calc variant",
      script: `assertions:assert @num!(${TOKEN}::{drift()(int256)} + 5) < 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a } = expectCalcJudge(param, CALC_OP.SLt);
        const add = combinator(a);
        expect(add.functionName).to.equal("calc");
        expect(add.args[0]).to.equal(CALC_OP.SAdd);
      },
    },
    {
      name: "compiles a bare @bool! or-expression to calc(Or) judged EQ 1",
      script: `assertions:assert @bool!((${TOKEN}::{supply()(uint256)} > 0) or (${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}} > 10))`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Or);
        const left = combinator(a);
        expect(left.functionName).to.equal("calc");
        expect(left.args[0]).to.equal(CALC_OP.Gt);
        const right = combinator(b);
        expect(right.functionName).to.equal("calc");
        expect(right.args[0]).to.equal(CALC_OP.Gt);
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
      name: "left-folds variadic @min! into nested calc(Min) calls",
      script: `assertions:assert @min!(${TOKEN}::{supply()(uint256)} ${TOKEN}::{cap()(uint256)} 5) <= 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Lte", 5n);
        const outer = combinator(param);
        expect(outer.functionName).to.equal("calc");
        expect(outer.args[0]).to.equal(CALC_OP.Min);
        const inner = combinator(outer.args[1] as unknown as Param);
        expect(inner.functionName).to.equal("calc");
        expect(inner.args[0]).to.equal(CALC_OP.Min);
        expectRawWord(outer.args[2] as unknown as Param, 5n);
      },
    },
    {
      name: "compiles @absdiff! to calc(AbsDiff)",
      script: `assertions:assert @absdiff!(${TOKEN}::{supply()(uint256)} 100) <= 5`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Lte", 5n);
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.AbsDiff);
      },
    },
    {
      name: "judges two live sides with calc(Gt) EQ 1",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} > ${TOKEN}::{cap()(uint256)}`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Gt);
        expect(staticCallOf(a).target).to.equal(TOKEN);
        expect(staticCallOf(b).target).to.equal(TOKEN);
      },
    },
    // ---- @bytes! / @not! ---------------------------------------------------
    {
      name: "compiles @bytes! bitwise-and through calc(And)",
      script: `assertions:assert @bytes!(${TOKEN}::{flags()(bytes32)} "&" 0x00000000000000000000000000000000000000000000000000000000000000ff) == 3`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 3n);
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.And);
        expect(staticCallOf(calc.args[1] as unknown as Param).target).to.equal(
          TOKEN,
        );
        expectRawWord(calc.args[2] as unknown as Param, 0xffn);
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
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Add);
        // The cast is free: the paused() call itself is the left operand.
        expect(staticCallOf(calc.args[1] as unknown as Param).target).to.equal(
          TOKEN,
        );
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
      name: "compiles @not! on a numeric value to unary(Not)",
      script: `assertions:assert @not!(${TOKEN}::{supply()(uint256)}) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 1n);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("unary");
        expect(inner.args[0]).to.equal(UNARY_OP.Not);
        expect(staticCallOf(inner.args[1] as unknown as Param).target).to.equal(
          TOKEN,
        );
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
      name: "compiles @chainid! to env(ChainId)",
      script: `assertions:assert @chainid! == 100 "wrong chain"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("env");
        expect(inner.args[0]).to.equal(ENV_OP.ChainId);
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
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Add);
        const left = combinator(calc.args[1] as unknown as Param);
        expect(left.functionName).to.equal("env");
        expect(left.args[0]).to.equal(ENV_OP.ChainId);
        expectRawWord(calc.args[2] as unknown as Param, 1n);
      },
    },
    {
      name: "compiles @codehash! of a literal address to env(CodeHash)",
      script: `assertions:assert @codehash!(${TOKEN}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const inner = combinator(param);
        expect(inner.functionName).to.equal("env");
        expect(inner.args[0]).to.equal(ENV_OP.CodeHash);
        expect(inner.args[1]).to.equal(BigInt(TOKEN));
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
      name: "compiles @codehash! of a call-resolved address to unary(CodeHash)",
      script: `assertions:assert @codehash!(${TOKEN}::{implementation()(address)}) != 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Ne);
        const inner = combinator(a);
        expect(inner.functionName).to.equal("unary");
        expect(inner.args[0]).to.equal(UNARY_OP.CodeHash);
        const call = staticCallOf(inner.args[1] as unknown as Param);
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
      name: "judges two live @codehash! sides with calc(Eq)",
      script: `assertions:assert @codehash!(${TOKEN}) == @codehash!(${HOLDER})`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { a, b } = expectCalcJudge(param, CALC_OP.Eq);
        const left = combinator(a);
        expect(left.functionName).to.equal("env");
        expect(left.args[0]).to.equal(ENV_OP.CodeHash);
        expect(left.args[1]).to.equal(BigInt(TOKEN));
        const right = combinator(b);
        expect(right.args[0]).to.equal(ENV_OP.CodeHash);
        expect(right.args[1]).to.equal(BigInt(HOLDER));
      },
    },
    // ---- nested live call arguments ----------------------------------------
    {
      name: "compiles a nested call argument to a combinators invoke",
      script: `assertions:assert ${A}::{a(address)(uint256) ${B}::{b()(address)}} == 7`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 7n);
        const { target, selector, segments } = invokeOf(param);
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
      name: "compiles example 1: two invoke levels with a lens on the outer call",
      script: `assertions:assert ${A}::{a(address)(uint256,uint256[]) ${B}::{b(uint256,uint256)(address) ${C}::{c(address)(uint256) ${ME}} ${D}::{d()(uint256)}}}[_ [$]] == 7 "nested"`,
      validate: (actions) => {
        const { param, message } = decodeAssert(actions);
        expect(message).to.equal("nested");
        expectConstraint(param, "Eq", 7n);

        // The judged value: nav with the lens [_ [$]] (path [1, 0]) over
        // the invoke that constructs a(<b>).
        const nav = combinator(param);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(uint256,uint256[])");
        expect(nav.args[2]).to.deep.equal([1n, 0n]);

        const aInvoke = invokeOf(nav.args[0] as unknown as Param);
        expectRawWord(aInvoke.target, BigInt(A));
        expect(aInvoke.selector).to.equal(selectorOf("a(address)"));
        expect(aInvoke.segments).to.have.lengthOf(1);

        // Nested level: the invoke constructing b(<c>, <d>) — two live
        // word segments, no literal spans between them.
        const bInvoke = invokeOf(aInvoke.segments[0]);
        expectRawWord(bInvoke.target, BigInt(B));
        expect(bInvoke.selector).to.equal(selectorOf("b(uint256,uint256)"));
        expect(bInvoke.segments).to.have.lengthOf(2);
        const cCall = staticCallOf(bInvoke.segments[0]);
        expect(cCall.target).to.equal(C);
        expect(cCall.data).to.equal(
          `${selectorOf("c(address)")}${word(BigInt(ME)).slice(2)}`,
        );
        const dCall = staticCallOf(bInvoke.segments[1]);
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
        const { target, selector, segments } = invokeOf(param);
        expectRawWord(target, BigInt(A));
        expect(selector).to.equal(selectorOf("a(address)"));
        expect(segments).to.have.lengthOf(1);
        // The word segment is the nav over b()'s (address,address[][]) return.
        const nav = combinator(segments[0]);
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
        const { target, selector, segments } = invokeOf(param);
        expectRawWord(target, BigInt(A));
        expect(selector).to.equal(selectorOf("a(address[])"));

        // Two segments: the literal head (offset 64 skips the envelope's
        // own offset word) and the nav whose envelope the judge appends.
        // No affine ByteLen arithmetic anywhere — assertParam's own layout
        // no longer depends on the envelope size.
        expect(segments).to.have.lengthOf(2);
        expectRawWord(segments[0], 64n);
        const nav = combinator(segments[1]);
        expect(nav.functionName).to.equal("nav");
        expect(nav.args[1]).to.equal("(address,address[][])");
        expect(nav.args[2]).to.deep.equal([1n, 1n]);
        expect(staticCallOf(nav.args[0] as unknown as Param).target).to.equal(
          B,
        );
      },
    },
    {
      name: "splits a chain around a live-arg hop: the invoke becomes the next hop's start",
      script: `assertions:assert ${A}::{f(uint256)(address) ${B}::{g()(uint256)}}::{h()(uint256)} == 1`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", 1n);
        const chain = combinator(param);
        expect(chain.functionName).to.equal("chain");
        expect(chain.args[1]).to.deep.equal([selectorOf("h()")]);
        const inv = invokeOf(chain.args[0] as unknown as Param);
        expectRawWord(inv.target, BigInt(A));
        expect(inv.selector).to.equal(selectorOf("f(uint256)"));
        expect(inv.segments).to.have.lengthOf(1);
        const g = staticCallOf(inv.segments[0]);
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
        const aInvoke = invokeOf(param);
        expect(aInvoke.selector).to.equal(selectorOf("a(uint256)"));
        expect(aInvoke.segments).to.have.lengthOf(1);
        const bInvoke = invokeOf(aInvoke.segments[0]);
        expect(bInvoke.selector).to.equal(selectorOf("b(address[])"));
        expect(bInvoke.segments).to.have.lengthOf(2);
        expectRawWord(bInvoke.segments[0], 64n);
        const nav = combinator(bInvoke.segments[1]);
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
        const aInvoke = invokeOf(param);
        expect(aInvoke.selector).to.equal(selectorOf("a(uint256,uint256)"));
        expect(aInvoke.segments).to.have.lengthOf(2);
        for (const segment of aInvoke.segments) {
          const bInvoke = invokeOf(segment);
          expect(bInvoke.selector).to.equal(selectorOf("b(address[])"));
          expect(bInvoke.segments).to.have.lengthOf(2);
        }
      },
    },
    // ---- @invoke! ----------------------------------------------------------
    {
      name: "compiles @invoke! with a literal target and constant argument",
      script: `assertions:assert @invoke!(${TOKEN} "balanceOf(address)(uint256)" ${HOLDER}) >= 10e18`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Gte", 10n * 10n ** 18n);
        const { target, selector, segments } = invokeOf(param);
        expectRawWord(target, BigInt(TOKEN));
        expect(selector).to.equal(selectorOf("balanceOf(address)"));
        expect(segments).to.have.lengthOf(1);
        expectRawWord(segments[0], BigInt(HOLDER));
      },
    },
    {
      name: "compiles @invoke! with a call-resolved target",
      script: `assertions:assert @invoke!(${A}::{asset()(address)} "totalSupply()(uint256)") > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { target, selector, segments } = invokeOf(param);
        const assetCall = staticCallOf(target);
        expect(assetCall.target).to.equal(A);
        expect(assetCall.data).to.equal(selectorOf("asset()"));
        expect(selector).to.equal(selectorOf("totalSupply()"));
        expect(segments).to.have.lengthOf(0);
      },
    },
    {
      name: "compiles @invoke! with a live call argument",
      script: `assertions:assert @invoke!(${A} "convertToAssets(uint256)(uint256)" ${B}::{totalSupply()(uint256)}) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        const { target, selector, segments } = invokeOf(param);
        expectRawWord(target, BigInt(A));
        expect(selector).to.equal(selectorOf("convertToAssets(uint256)"));
        expect(segments).to.have.lengthOf(1);
        const supplyCall = staticCallOf(segments[0]);
        expect(supplyCall.target).to.equal(B);
        expect(supplyCall.data).to.equal(selectorOf("totalSupply()"));
      },
    },
    {
      name: "composes @invoke! inside @num! arithmetic",
      script: `assertions:assert @num!(@invoke!(${A} "convertToAssets(uint256)(uint256)" 1e18) * 2) > 0`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        // Unsigned `> 0` folds to a GTE 1 constraint on the expression.
        expectConstraint(param, "Gte", 1n);
        const calc = combinator(param);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Mul);
        const inv = invokeOf(calc.args[1] as unknown as Param);
        expect(inv.selector).to.equal(selectorOf("convertToAssets(uint256)"));
        expect(inv.segments).to.have.lengthOf(1);
        expectRawWord(inv.segments[0], 10n ** 18n);
      },
    },
    {
      name: "judges a string-returning @invoke! via keccak of the envelope",
      script: `assertions:assert @invoke!(${TOKEN} "name()(string)") == "Wrapped Ether"`,
      validate: (actions) => {
        const { param } = decodeAssert(actions);
        expectConstraint(param, "Eq", BigInt(stringDigest("Wrapped Ether")));
        const hash = combinator(param);
        expect(hash.functionName).to.equal("data");
        expect(hash.args[0]).to.equal(DATA_OP.Hash);
        const inv = invokeOf(hash.args[1] as unknown as Param);
        expect(inv.selector).to.equal(selectorOf("name()"));
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
      name: "rejects an empty @includes! part",
      script: `assertions:assert @includes!(${TOKEN}::{name()(string)} "")`,
      error: "@includes! part must be a non-empty string",
    },
    {
      name: "rejects a reversed @charset! range",
      script: `assertions:assert @charset!(${TOKEN}::{symbol()(string)} "z-a")`,
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
      error: "only valid inside an assertions:assert",
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
      name: "rejects a @split! segment in arithmetic",
      script: `assertions:assert @num!(@split!(${TOKEN}::{name()(string)} " " 0) + 1) > 0`,
      error: "numeric operands",
    },
    {
      name: "rejects @split! without its index",
      script: `assertions:assert @split!(${TOKEN}::{name()(string)} " ") == "LP"`,
      error: "@split! expects (call delimiter index)",
    },
    {
      name: "rejects @split! as the call of another chain helper",
      script: `assertions:assert @bytelen!(@split!(${TOKEN}::{name()(string)} " " 1)) == 32`,
      error: "expects a `::` call expression",
    },
    {
      name: "rejects ordering comparisons on strings",
      script: `assertions:assert @bool!(@split!(${TOKEN}::{name()(string)} " " 0) > "A")`,
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
    // ---- @invoke! ----------------------------------------------------------
    {
      name: "rejects @invoke! without a signature",
      script: `assertions:assert @invoke!(${TOKEN}) > 0`,
      error: "@invoke! expects (target abi ...params)",
    },
    {
      name: "rejects an @invoke! signature without return types",
      script: `assertions:assert @invoke!(${TOKEN} "balanceOf(address)" ${HOLDER}) > 0`,
      error: "read-abi signature",
    },
    {
      name: "rejects an @invoke! signature with multiple return types",
      script: `assertions:assert @invoke!(${TOKEN} "getReserves()(uint112,uint112)") > 0`,
      error: "exactly one return type",
    },
    {
      name: "rejects a non-address @invoke! target",
      script: `assertions:assert @invoke!(123 "totalSupply()(uint256)") > 0`,
      error: "must resolve to an address",
    },
    {
      name: "rejects an @invoke! target call not returning a single address",
      script: `assertions:assert @invoke!(${TOKEN}::{decimals()(uint256)} "totalSupply()(uint256)") > 0`,
      error: "must return a single address",
    },
    {
      name: "rejects an @invoke! argument-count mismatch",
      script: `assertions:assert @invoke!(${TOKEN} "balanceOf(address)(uint256)") > 0`,
      error: "expects 1 argument",
    },
    {
      name: "rejects @invoke! outside an assertion",
      script: `set $x @assertions:invoke!(${TOKEN} "totalSupply()(uint256)")`,
      error: "only valid inside an assertions:assert",
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

// Without overrides the module targets the canonical CREATE2 deployments.
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
      name: "defaults to the canonical combinators v2 address",
      script: `assertions:assert @chainid! == 100`,
      validate: (actions) => {
        const { param } = decodeAssert(actions, ASSERTIONS_ADDRESS);
        const inner = combinator(param, COMBINATORS_ADDRESS);
        expect(inner.functionName).to.equal("env");
        expect(inner.args[0]).to.equal(ENV_OP.ChainId);
      },
    },
  ],
});
