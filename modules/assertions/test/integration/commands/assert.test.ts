import "../../setup";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { describeCommand } from "@evmcrispr/test-utils/evml";
import {
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbi,
  toFunctionSelector,
} from "viem";
import {
  ARITH_OP,
  CMP_OP,
  COMBINATORS_ABI,
  LOGIC_OP,
} from "../../../src/lib/combinators";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const COMBINATORS = getAddress("0x00000000000000000000000000000000c0b1a705");
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const HOLDER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
// DAI on gnosis in the mocked token list.
const DAI = getAddress("0x44fA8E6f47987339850636F88629646662444217");

const preamble = `load assertions\nset $assertions:address ${ASSERTIONS}\nset $assertions:combinators ${COMBINATORS}`;

function selectorOf(signature: string): string {
  return toFunctionSelector(`function ${signature}`);
}

function expectReadOnlyTo(actions: any[], to: Address, signature: string) {
  expect(actions).to.have.lengthOf(1);
  const action = actions[0];
  expect(isTransactionAction(action), "expected a transaction action").to.be
    .true;
  expect(action.readOnly, "expected readOnly flag").to.equal(true);
  expect(getAddress(action.to)).to.equal(to);
  expect(
    (action.data as string).startsWith(selectorOf(signature)),
    `expected calldata for ${signature}`,
  ).to.be.true;
  return action;
}

/** Decode the single action's calldata against a core assert signature. */
function decodeCore(actions: any[], to: Address, signature: string): any[] {
  const humanAbi: string[] = [`function ${signature} view`];
  const action = expectReadOnlyTo(actions, to, signature);
  const { args } = decodeFunctionData({
    abi: parseAbi(humanAbi),
    data: action.data,
  });
  return args as any[];
}

/** Decode nested combinator calldata. */
function decodeCombinator(data: `0x${string}`) {
  return decodeFunctionData({ abi: COMBINATORS_ABI, data });
}

describeCommand("assert", {
  describeName: "Assertions > commands > assert",
  preamble,
  cases: [
    {
      name: "encodes a >= comparison on a uint return (inline ABI)",
      script: `assertions:assert ${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}} >= 10e18 "insufficient"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(TOKEN);
        expect(args[2]).to.equal(10n * 10n ** 18n);
        expect(args[3]).to.equal("insufficient");
      },
    },
    {
      name: "selects a tuple element with a destructure lens (N variant)",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[_ $ _] >= 1000 "low reserve"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallUintN(address,bytes,uint256,uint256,string)",
        );
        expect(args[2]).to.equal(1n);
      },
    },
    {
      name: "compiles an element lens to elementCall judged as the element type",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[_ $]] == ${HOLDER}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallAddress(address,bytes,address,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("elementCall");
        expect(getAddress(inner.args[0] as string)).to.equal(TOKEN);
        expect(inner.args[2]).to.equal(0n);
        expect(inner.args[3]).to.equal(1n);
        expect(getAddress(args[2])).to.equal(HOLDER);
      },
    },
    {
      name: "compiles a nested element lens inside an expression",
      script: `assertions:assert @bool!(${TOKEN}::{tiers()(uint256[])}[[_ _ $]] > 5)`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        const cmp = decodeCombinator(args[1]);
        expect(cmp.functionName).to.equal("cmpUint");
        expect(cmp.args[0]).to.equal(CMP_OP.Gt);
        const element = decodeCombinator(cmp.args[2] as `0x${string}`);
        expect(element.functionName).to.equal("elementCall");
        expect(element.args[2]).to.equal(0n);
        expect(element.args[3]).to.equal(2n);
      },
    },
    {
      name: "uses assertTrue for a bare boolean assertion",
      script: `assertions:assert ${TOKEN}::{paused()(bool)}`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        ),
    },
    {
      name: "uses assertApproxEqCallUint with --delta",
      script: `assertions:assert ${TOKEN}::{price()(uint256)} ~= 2000 --delta 50 "off"`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertApproxEqCallUint(address,bytes,uint256,uint256,string)",
        ),
    },
    // ---- int256 (new in core 1.1) ------------------------------------
    {
      name: "encodes an int256 comparison with a negative expected value",
      script: `assertions:assert ${TOKEN}::{drift()(int256)} <= -5`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLeCallInt(address,bytes,int256,string)",
        );
        expect(args[2]).to.equal(-5n);
      },
    },
    {
      name: "encodes a tuple-indexed int256 comparison",
      script: `assertions:assert ${TOKEN}::{pair()(int256,uint256)}[$ _] == -1`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallIntN(address,bytes,uint256,int256,string)",
        );
        expect(args[2]).to.equal(0n);
        expect(args[3]).to.equal(-1n);
      },
    },
    {
      name: "uses assertApproxEqCallInt for ~= on an int return",
      script: `assertions:assert ${TOKEN}::{drift()(int256)} ~= -100 --delta 5`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertApproxEqCallInt(address,bytes,int256,uint256,string)",
        );
        expect(args[2]).to.equal(-100n);
        expect(args[3]).to.equal(5n);
      },
    },
    // ---- booleans fold != into the Eq surface ------------------------
    {
      name: "compiles `!= true` to assertFalse (no assertNeCallBool)",
      script: `assertions:assert ${TOKEN}::{paused()(bool)} != true`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertFalse(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(TOKEN);
      },
    },
    {
      name: "compiles `== false` to assertFalse",
      script: `assertions:assert ${TOKEN}::{paused()(bool)} == false`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertFalse(address,bytes,string)",
        ),
    },
    {
      name: "compiles an indexed bool != to assertEqCallBoolN with the negated value",
      script: `assertions:assert ${TOKEN}::{flags()(bool,bool)}[$ _] != true`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallBoolN(address,bytes,uint256,bool,string)",
        );
        expect(args[2]).to.equal(0n);
        expect(args[3]).to.equal(false);
      },
    },
    // ---- strings and bytes -------------------------------------------
    {
      name: "compiles a plain string comparison to assertEqCallStringN index 0",
      script: `assertions:assert ${TOKEN}::{name()(string)} == "Wrapped Ether"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        expect(args[2]).to.equal(0n);
        expect(args[3]).to.equal("Wrapped Ether");
      },
    },
    {
      name: "compiles a string != to assertNeCallStringN",
      script: `assertions:assert ${TOKEN}::{name()(string)} != "Foo"`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertNeCallStringN(address,bytes,uint256,string,string)",
        ),
    },
    {
      name: "compiles a bytes comparison to assertEqCallBytes",
      script: `assertions:assert ${TOKEN}::{payload()(bytes)} == 0x1234`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertEqCallBytes(address,bytes,bytes,string)",
        ),
    },
    // ---- constant side normalization ---------------------------------
    {
      name: "mirrors the operator when the constant is on the left",
      script: `assertions:assert 5 < ${TOKEN}::{supply()(uint256)}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(args[2]).to.equal(5n);
      },
    },
    {
      name: "folds constant subexpressions at build time",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} >= @num!(2 * 3e18)`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(TOKEN);
        expect(args[2]).to.equal(6n * 10n ** 18n);
      },
    },
    // ---- :: chains → chainCall ---------------------------------------
    {
      name: "compiles a :: chain through Combinators.chainCall",
      script: `assertions:assert ${TOKEN}::{vault()(address)}::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("chainCall");
        expect(getAddress(inner.args[0] as string)).to.equal(TOKEN);
        expect(inner.args[1]).to.have.lengthOf(2);
        expect(args[3]).to.equal("WETH");
      },
    },
    {
      name: "prefixes non-final hops with the selected word index",
      script: `assertions:assert ${TOKEN}::{vault()(address)}::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        const inner = decodeCombinator(args[1]);
        const hops = inner.args[1] as `0x${string}`[];
        // Non-final hop: 32-byte word index (0) ++ vault() selector.
        expect(hops[0].slice(0, 66)).to.equal(`0x${"0".repeat(64)}`);
        expect(hops[0].length).to.equal(66 + 8);
        // Final hop: unprefixed symbol() calldata (selector only).
        expect(hops[1].length).to.equal(10);
      },
    },
    {
      name: "chains through a lens-selected address of a multi-value return",
      script: `assertions:assert ${TOKEN}::{poolInfo()(uint112,uint112,address)}[_ _ $]::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("chainCall");
        const hops = inner.args[1] as `0x${string}`[];
        expect(hops).to.have.lengthOf(2);
        // The prefix selects word 2, where the address output lives.
        expect(hops[0].slice(0, 66)).to.equal(`0x${"0".repeat(63)}2`);
      },
    },
    // ---- @len! ---------------------------------------------------------
    {
      name: "compiles a top-level @len! to the array-length family",
      script: `assertions:assert @len!(${TOKEN}::{holders()(address[])}) >= 3`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallArrayLength(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(TOKEN);
        expect(args[2]).to.equal(3n);
      },
    },
    {
      name: "supports != on @len! via assertNeCallArrayLength (new in 1.1)",
      script: `assertions:assert @len!(${TOKEN}::{holders()(address[])}) != 0`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertNeCallArrayLength(address,bytes,uint256,string)",
        ),
    },
    {
      name: "routes a chained @len! argument through chainCall",
      script: `assertions:assert @len!(${TOKEN}::{vault()(address)}::{holders()(address[])}) == 2`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallArrayLength(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("chainCall");
      },
    },
    {
      name: "compiles a nested @len! to arrayLengthCall inside an expression",
      script: `assertions:assert @num!(@len!(${TOKEN}::{holders()(address[])}) * 2) > 4`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calcUint");
        expect(calc.args[0]).to.equal(ARITH_OP.Mul);
        const left = decodeCombinator(calc.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("arrayLengthCall");
        const right = decodeCombinator(calc.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("constantUint");
        expect(right.args[0]).to.equal(2n);
      },
    },
    // ---- other chain-call helpers ------------------------------------
    {
      name: "compiles @split! to splitCall judged by assertEqCallStringN",
      script: `assertions:assert @split!(${TOKEN}::{name()(string)} " " 1) == "LP"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        expect(args[2]).to.equal(0n);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("splitCall");
        expect(inner.args[2]).to.equal(" ");
        expect(inner.args[3]).to.equal(1n);
        expect(args[3]).to.equal("LP");
      },
    },
    {
      name: "compiles a negative @split! index for from-the-end selection",
      script: `assertions:assert @split!(${TOKEN}::{name()(string)} " " -1) == "Token"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("splitCall");
        expect(inner.args[2]).to.equal(" ");
        expect(inner.args[3]).to.equal(-1n);
        expect(args[3]).to.equal("Token");
      },
    },
    {
      name: "compiles a nested string equality to an on-chain keccak comparison",
      script: `assertions:assert @bool!(@split!(${TOKEN}::{name()(string)} " " -1) == "LP")`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        const cmp = decodeCombinator(args[1]);
        expect(cmp.functionName).to.equal("cmpUint");
        expect(cmp.args[0]).to.equal(CMP_OP.Eq);
        const live = decodeCombinator(cmp.args[2] as `0x${string}`);
        expect(live.functionName).to.equal("hashCall");
        const wrapped = decodeFunctionData({
          abi: COMBINATORS_ABI,
          data: (live.args[1] as `0x${string}`[])[0],
        });
        expect(wrapped.functionName).to.equal("splitCall");
        const digest = decodeCombinator(cmp.args[4] as `0x${string}`);
        expect(digest.functionName).to.equal("constantUint");
        expect(digest.args[0]).to.equal(
          BigInt(keccak256(encodeAbiParameters([{ type: "string" }], ["LP"]))),
        );
      },
    },
    {
      name: "compiles two live strings to a keccak-vs-keccak comparison",
      script: `assertions:assert ${TOKEN}::{name()(string)} == ${TOKEN}::{symbol()(string)}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        const cmp = decodeCombinator(args[1]);
        expect(cmp.functionName).to.equal("cmpUint");
        expect(cmp.args[0]).to.equal(CMP_OP.Eq);
        const left = decodeCombinator(cmp.args[2] as `0x${string}`);
        const right = decodeCombinator(cmp.args[4] as `0x${string}`);
        expect(left.functionName).to.equal("hashCall");
        expect(right.functionName).to.equal("hashCall");
        expect(getAddress(left.args[0] as string)).to.equal(TOKEN);
        expect(getAddress(right.args[0] as string)).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @hash! to hashCall judged by assertEqCallBytes32",
      script: `assertions:assert @hash!(${TOKEN}::{name()(string)}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallBytes32(address,bytes,bytes32,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("hashCall");
      },
    },
    {
      name: "compiles a bare @includes! to includesCall judged by assertTrue",
      script: `assertions:assert @includes!(${TOKEN}::{name()(string)} "LP")`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("includesCall");
        expect(getAddress(inner.args[0] as string)).to.equal(TOKEN);
        expect(inner.args[2]).to.equal("LP");
      },
    },
    {
      name: "compiles @includes! == false to assertFalse",
      script: `assertions:assert @includes!(${TOKEN}::{name()(string)} "Sushi") == false "rebranded"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertFalse(address,bytes,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("includesCall");
        expect(inner.args[2]).to.equal("Sushi");
        expect(args[2]).to.equal("rebranded");
      },
    },
    {
      name: "nests @includes! inside @bool! logic",
      script: `assertions:assert @bool!(@includes!(${TOKEN}::{name()(string)} "LP") and @charset!(${TOKEN}::{symbol()(string)} "a-z"))`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        const logic = decodeCombinator(args[1]);
        expect(logic.functionName).to.equal("logicBool");
        expect(logic.args[0]).to.equal(LOGIC_OP.And);
        const left = decodeCombinator(logic.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("includesCall");
        const right = decodeCombinator(logic.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("charsetCall");
      },
    },
    {
      name: "compiles @charset! to charsetCall with the class bitmap",
      script: `assertions:assert @charset!(${TOKEN}::{symbol()(string)} "a-z") == true`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("charsetCall");
        // bits 97..122 = a-z
        expect(inner.args[2]).to.equal(0x07fffffen << 96n);
      },
    },
    {
      name: "@charset! treats a trailing dash as the literal `-`",
      script: `assertions:assert @charset!(${TOKEN}::{name()(string)} "a-z0-9-")`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("charsetCall");
        const expected = (0x07fffffen << 96n) | (0x3ffn << 48n) | (1n << 45n); // a-z | 0-9 | -
        expect(inner.args[2]).to.equal(expected);
      },
    },
    {
      name: "compiles @at! to a raw-word uintCall extraction",
      script: `assertions:assert @at!(${TOKEN}::{getReserves()(uint112,uint112,uint32)} 1) > 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("uintCall");
        expect(inner.args[2]).to.equal(1n);
      },
    },
    {
      name: "compiles a negative @at! word index for from-the-end extraction",
      script: `assertions:assert @at!(${TOKEN}::{holders()(address[])} -1) != 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertNeCallUint(address,bytes,uint256,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("uintCall");
        expect(inner.args[2]).to.equal(-1n);
      },
    },
    {
      name: "compiles @bytelen! to lengthCall",
      script: `assertions:assert @bytelen!(${TOKEN}::{holders()(address[])}) == 128`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallUint(address,bytes,uint256,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("lengthCall");
      },
    },
    // ---- @balance! ----------------------------------------------------
    {
      name: "compiles a native @balance! to ethBalance",
      script: `assertions:assert @balance!(XDAI ${HOLDER}) > 1e18`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("ethBalance");
        expect(getAddress(inner.args[0] as string)).to.equal(HOLDER);
      },
    },
    {
      name: "resolves a token symbol in @balance! to a live balanceOf",
      script: `assertions:assert @balance!(DAI ${HOLDER}) >= 10e18`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(DAI);
        expect((args[1] as string).startsWith(selectorOf("balanceOf(address)")))
          .to.be.true;
      },
    },
    {
      name: "compiles a native @balance! of a call-resolved account to ethBalanceCall",
      script: `assertions:assert @balance!(XDAI ${TOKEN}::{treasury()(address)}) >= 1e18`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallUint(address,bytes,uint256,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("ethBalanceCall");
        expect(getAddress(inner.args[0] as string)).to.equal(TOKEN);
      },
    },
    // ---- @num! / @bool! composition ----------------------------------
    {
      name: "compiles live addition through calcUint",
      script: `assertions:assert @num!(@balance!(XDAI ${HOLDER}) + ${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}}) > 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calcUint");
        expect(calc.args[0]).to.equal(ARITH_OP.Add);
        const left = decodeCombinator(calc.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("ethBalance");
        expect(getAddress(calc.args[3] as string)).to.equal(TOKEN);
      },
    },
    {
      name: "promotes mixed int operands to calcInt",
      script: `assertions:assert @num!(${TOKEN}::{drift()(int256)} + 5) < 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLtCallInt(address,bytes,int256,string)",
        );
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calcInt");
        expect(calc.args[0]).to.equal(ARITH_OP.Add);
      },
    },
    {
      name: "compiles a bare @bool! or-expression to logicBool judged by assertTrue",
      script: `assertions:assert @bool!((${TOKEN}::{supply()(uint256)} > 0) or (${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}} > 10))`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const logic = decodeCombinator(args[1]);
        expect(logic.functionName).to.equal("logicBool");
        expect(logic.args[0]).to.equal(LOGIC_OP.Or);
        const left = decodeCombinator(logic.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("cmpUint");
        expect(left.args[0]).to.equal(CMP_OP.Gt);
        const right = decodeCombinator(logic.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("cmpUint");
      },
    },
    {
      name: "compiles a bare @bool!(not …) to assertFalse on the inner call",
      script: `assertions:assert @bool!(not ${TOKEN}::{paused()(bool)})`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertFalse(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(TOKEN);
      },
    },
    {
      name: "left-folds variadic @min! into nested calcUint(Min) calls",
      script: `assertions:assert @min!(${TOKEN}::{supply()(uint256)} ${TOKEN}::{cap()(uint256)} 5) <= 5`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLeCallUint(address,bytes,uint256,string)",
        );
        const outer = decodeCombinator(args[1]);
        expect(outer.functionName).to.equal("calcUint");
        expect(outer.args[0]).to.equal(ARITH_OP.Min);
        const inner = decodeCombinator(outer.args[2] as `0x${string}`);
        expect(inner.functionName).to.equal("calcUint");
        expect(inner.args[0]).to.equal(ARITH_OP.Min);
        const last = decodeCombinator(outer.args[4] as `0x${string}`);
        expect(last.functionName).to.equal("constantUint");
        expect(last.args[0]).to.equal(5n);
      },
    },
    {
      name: "compiles @absdiff! to calcUint(AbsDiff)",
      script: `assertions:assert @absdiff!(${TOKEN}::{supply()(uint256)} 100) <= 5`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLeCallUint(address,bytes,uint256,string)",
        );
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calcUint");
        expect(calc.args[0]).to.equal(ARITH_OP.AbsDiff);
      },
    },
    {
      name: "judges two live sides with cmpUint wrapped in assertTrue",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} > ${TOKEN}::{cap()(uint256)}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const cmp = decodeCombinator(args[1]);
        expect(cmp.functionName).to.equal("cmpUint");
        expect(cmp.args[0]).to.equal(CMP_OP.Gt);
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
      name: "rejects an element lens on a non-array return value",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[_ [$]] == ${HOLDER}`,
      error: "selects into a dynamic array",
    },
    {
      name: "rejects an element lens on a non-final chained call",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[$]]::{decimals()(uint256)} == 18`,
      error: "element lenses like [[_ $]] apply only to the final call",
    },
    {
      name: "rejects lens nesting deeper than one level",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[_ [$]]] == ${HOLDER}`,
      error: "deeper than one array level",
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
      name: "rejects @split! under @at!",
      script: `assertions:assert @at!(@split!(${TOKEN}::{name()(string)} " " 1) 0) == "LP"`,
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
  ],
});

// Without overrides the module targets the canonical CREATE2 deployments.
describeCommand("assert", {
  describeName: "Assertions > commands > assert (canonical addresses)",
  preamble: "load assertions",
  cases: [
    {
      name: "defaults to the canonical core v1.1 address",
      script: `assertions:assert ${TOKEN}::{paused()(bool)}`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          getAddress("0xA55E47bFD3d20A76e8E63a173387A5e3d4bEe3e0"),
          "assertTrue(address,bytes,string)",
        ),
    },
    {
      name: "defaults to the canonical combinators address",
      script: `assertions:assert @balance!(XDAI ${HOLDER}) > 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          getAddress("0xA55E47bFD3d20A76e8E63a173387A5e3d4bEe3e0"),
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(
          getAddress("0xa55eC09De097E206acF0B3c677724419AeFd04df"),
        );
      },
    },
  ],
});
