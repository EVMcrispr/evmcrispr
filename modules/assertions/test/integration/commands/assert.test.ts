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
  numberToHex,
  parseAbi,
  stringToHex,
  toFunctionSelector,
} from "viem";
import {
  CALC_OP,
  COMBINATORS_ABI,
  DATA_OP,
  ENV_OP,
  LEN_STEP,
  UNARY_OP,
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
      name: "compiles an element lens to a typed read judged as the terminal type",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[_ $]] == ${HOLDER}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallAddress(address,bytes,address,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("read");
        expect(getAddress(inner.args[0] as string)).to.equal(TOKEN);
        expect(inner.args[2]).to.deep.equal(["(address[],address)"]);
        expect(inner.args[3]).to.deep.equal([[0n, 1n]]);
        expect(getAddress(args[2])).to.equal(HOLDER);
      },
    },
    {
      name: "compiles a deep lens through nested arrays",
      script: `assertions:assert ${TOKEN}::{matrix()(address[][])}[[_ _ _ [_ $]]] == ${HOLDER}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallAddress(address,bytes,address,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("read");
        expect(inner.args[2]).to.deep.equal(["(address[][])"]);
        expect(inner.args[3]).to.deep.equal([[0n, 3n, 1n]]);
      },
    },
    {
      name: "compiles a struct-array field lens against a tuple descriptor",
      script: `assertions:assert ${TOKEN}::{proposals()((address,uint256,bool)[])}[[_ [_ _ $]]] == true`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("read");
        expect(inner.args[2]).to.deep.equal(["((address,uint256,bool)[])"]);
        expect(inner.args[3]).to.deep.equal([[0n, 1n, 2n]]);
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
        expect(cmp.functionName).to.equal("calc");
        expect(cmp.args[0]).to.equal(CALC_OP.Gt);
        const element = decodeCombinator(cmp.args[2] as `0x${string}`);
        expect(element.functionName).to.equal("read");
        expect(element.args[2]).to.deep.equal(["(uint256[])"]);
        expect(element.args[3]).to.deep.equal([[0n, 2n]]);
      },
    },
    {
      name: "compiles @len! over a lensed call through a typed read envelope",
      script: `assertions:assert @len!(${TOKEN}::{matrix()(address[][])}[[_ $]]) >= 3`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallArrayLength(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("read");
        expect(inner.args[2]).to.deep.equal(["(address[][])"]);
        expect(inner.args[3]).to.deep.equal([[0n, 1n]]);
        expect(args[2]).to.equal(3n);
      },
    },
    {
      name: "compiles @split! over a lensed struct-array string field",
      script: `assertions:assert @split!(${TOKEN}::{items()((string,uint256)[])}[[[$ _]]] " " -1) == "LP"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        const split = decodeCombinator(args[1]);
        expect(split.functionName).to.equal("data");
        expect(split.args[0]).to.equal(DATA_OP.Split);
        expect(getAddress(split.args[1] as string)).to.equal(COMBINATORS);
        const inner = decodeFunctionData({
          abi: COMBINATORS_ABI,
          data: (split.args[2] as `0x${string}`[])[0],
        });
        expect(inner.functionName).to.equal("read");
        expect(inner.args[2]).to.deep.equal(["((string,uint256)[])"]);
        expect(inner.args[3]).to.deep.equal([[0n, 0n, 0n]]);
        expect(split.args[3]).to.equal(stringToHex(" "));
        expect(split.args[4]).to.equal(-1n);
      },
    },
    {
      name: "resolves a rest-lens over a known-arity return at build time",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[... $ _] >= 1000 "low reserve"`,
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
      name: "keeps a rest-lens over a dynamic array negative for on-chain resolution",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[... $]] == ${HOLDER}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallAddress(address,bytes,address,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("read");
        expect(inner.args[2]).to.deep.equal(["(address[],address)"]);
        expect(inner.args[3]).to.deep.equal([[0n, -1n]]);
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
    // ---- :: chains → read ----------------------------------------------
    {
      name: "compiles a :: chain through Combinators.read",
      script: `assertions:assert ${TOKEN}::{vault()(address)}::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("read");
        expect(getAddress(inner.args[0] as string)).to.equal(TOKEN);
        expect(inner.args[1]).to.have.lengthOf(2);
        expect(args[3]).to.equal("WETH");
      },
    },
    {
      name: "encodes hops as plain calldata with raw passthrough types",
      script: `assertions:assert ${TOKEN}::{vault()(address)}::{symbol()(string)} == "WETH"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallStringN(address,bytes,uint256,string,string)",
        );
        const inner = decodeCombinator(args[1]);
        const hops = inner.args[1] as `0x${string}`[];
        // Both hops are plain abi.encodeCall data (selector only here).
        expect(hops[0].length).to.equal(10);
        expect(hops[1].length).to.equal(10);
        // Raw mode throughout: empty types, empty paths (word 0 default).
        expect(inner.args[2]).to.deep.equal(["", ""]);
        expect(inner.args[3]).to.deep.equal([[], []]);
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
        expect(inner.functionName).to.equal("read");
        expect(inner.args[1]).to.have.lengthOf(2);
        // The mid-chain path selects raw word 2, where the address lives.
        expect(inner.args[3]).to.deep.equal([[2n], []]);
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
      name: "routes a chained @len! argument through a read passthrough",
      script: `assertions:assert @len!(${TOKEN}::{vault()(address)}::{holders()(address[])}) == 2`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallArrayLength(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("read");
      },
    },
    {
      name: "compiles a nested @len! to a LEN-path read inside an expression",
      script: `assertions:assert @num!(@len!(${TOKEN}::{holders()(address[])}) * 2) > 4`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Mul);
        const left = decodeCombinator(calc.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("read");
        expect(left.args[2]).to.deep.equal(["(address[])"]);
        expect(left.args[3]).to.deep.equal([[0n, LEN_STEP]]);
        const right = decodeCombinator(calc.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("env");
        expect(right.args[0]).to.equal(ENV_OP.Constant);
        expect(right.args[1]).to.equal(2n);
      },
    },
    // ---- other chain-call helpers ------------------------------------
    {
      name: "compiles @split! to data(Split) judged by assertEqCallStringN",
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
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Split);
        expect(inner.args[3]).to.equal(stringToHex(" "));
        expect(inner.args[4]).to.equal(1n);
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
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Split);
        expect(inner.args[3]).to.equal(stringToHex(" "));
        expect(inner.args[4]).to.equal(-1n);
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
        expect(cmp.functionName).to.equal("calc");
        expect(cmp.args[0]).to.equal(CALC_OP.Eq);
        const live = decodeCombinator(cmp.args[2] as `0x${string}`);
        expect(live.functionName).to.equal("data");
        expect(live.args[0]).to.equal(DATA_OP.Hash);
        const wrapped = decodeFunctionData({
          abi: COMBINATORS_ABI,
          data: (live.args[2] as `0x${string}`[])[0],
        });
        expect(wrapped.functionName).to.equal("data");
        expect(wrapped.args[0]).to.equal(DATA_OP.Split);
        const digest = decodeCombinator(cmp.args[4] as `0x${string}`);
        expect(digest.functionName).to.equal("env");
        expect(digest.args[0]).to.equal(ENV_OP.Constant);
        expect(digest.args[1]).to.equal(
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
        expect(cmp.functionName).to.equal("calc");
        expect(cmp.args[0]).to.equal(CALC_OP.Eq);
        const left = decodeCombinator(cmp.args[2] as `0x${string}`);
        const right = decodeCombinator(cmp.args[4] as `0x${string}`);
        expect(left.functionName).to.equal("data");
        expect(left.args[0]).to.equal(DATA_OP.Hash);
        expect(right.functionName).to.equal("data");
        expect(right.args[0]).to.equal(DATA_OP.Hash);
        expect(getAddress(left.args[1] as string)).to.equal(TOKEN);
        expect(getAddress(right.args[1] as string)).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @hash! to data(Hash) judged by assertEqCallBytes32",
      script: `assertions:assert @hash!(${TOKEN}::{name()(string)}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallBytes32(address,bytes,bytes32,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Hash);
      },
    },
    {
      name: "compiles a bare @includes! to data(Includes) judged by assertTrue",
      script: `assertions:assert @includes!(${TOKEN}::{name()(string)} "LP")`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Includes);
        expect(getAddress(inner.args[1] as string)).to.equal(TOKEN);
        expect(inner.args[3]).to.equal(stringToHex("LP"));
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
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Includes);
        expect(inner.args[3]).to.equal(stringToHex("Sushi"));
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
        expect(logic.functionName).to.equal("calc");
        expect(logic.args[0]).to.equal(CALC_OP.And);
        const left = decodeCombinator(logic.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("data");
        expect(left.args[0]).to.equal(DATA_OP.Includes);
        const right = decodeCombinator(logic.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("data");
        expect(right.args[0]).to.equal(DATA_OP.Charset);
      },
    },
    {
      name: "compiles @charset! to data(Charset) with the class bitmap",
      script: `assertions:assert @charset!(${TOKEN}::{symbol()(string)} "a-z") == true`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Charset);
        // bits 97..122 = a-z
        expect(inner.args[3]).to.equal(
          numberToHex(0x07fffffen << 96n, { size: 32 }),
        );
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
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.Charset);
        const expected = (0x07fffffen << 96n) | (0x3ffn << 48n) | (1n << 45n); // a-z | 0-9 | -
        expect(inner.args[3]).to.equal(numberToHex(expected, { size: 32 }));
      },
    },
    {
      name: "compiles @bytelen! to data(ByteLen)",
      script: `assertions:assert @bytelen!(${TOKEN}::{holders()(address[])}) == 128`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallUint(address,bytes,uint256,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("data");
        expect(inner.args[0]).to.equal(DATA_OP.ByteLen);
      },
    },
    // ---- @balance! ----------------------------------------------------
    {
      name: "compiles a native @balance! to env(Balance)",
      script: `assertions:assert @balance!(XDAI ${HOLDER}) > 1e18`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("env");
        expect(inner.args[0]).to.equal(ENV_OP.Balance);
        expect(inner.args[1]).to.equal(BigInt(HOLDER));
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
      name: "compiles a native @balance! of a call-resolved account to unary(Balance)",
      script: `assertions:assert @balance!(XDAI ${TOKEN}::{treasury()(address)}) >= 1e18`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGeCallUint(address,bytes,uint256,string)",
        );
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("unary");
        expect(inner.args[0]).to.equal(UNARY_OP.Balance);
        expect(getAddress(inner.args[1] as string)).to.equal(TOKEN);
      },
    },
    // ---- @num! / @bool! composition ----------------------------------
    {
      name: "compiles live addition through calc(Add)",
      script: `assertions:assert @num!(@balance!(XDAI ${HOLDER}) + ${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}}) > 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Add);
        const left = decodeCombinator(calc.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("env");
        expect(left.args[0]).to.equal(ENV_OP.Balance);
        expect(getAddress(calc.args[3] as string)).to.equal(TOKEN);
      },
    },
    {
      name: "promotes mixed int operands to the signed calc variant",
      script: `assertions:assert @num!(${TOKEN}::{drift()(int256)} + 5) < 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLtCallInt(address,bytes,int256,string)",
        );
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.SAdd);
      },
    },
    {
      name: "compiles a bare @bool! or-expression to calc(Or) judged by assertTrue",
      script: `assertions:assert @bool!((${TOKEN}::{supply()(uint256)} > 0) or (${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}} > 10))`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const logic = decodeCombinator(args[1]);
        expect(logic.functionName).to.equal("calc");
        expect(logic.args[0]).to.equal(CALC_OP.Or);
        const left = decodeCombinator(logic.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("calc");
        expect(left.args[0]).to.equal(CALC_OP.Gt);
        const right = decodeCombinator(logic.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("calc");
        expect(right.args[0]).to.equal(CALC_OP.Gt);
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
      name: "left-folds variadic @min! into nested calc(Min) calls",
      script: `assertions:assert @min!(${TOKEN}::{supply()(uint256)} ${TOKEN}::{cap()(uint256)} 5) <= 5`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLeCallUint(address,bytes,uint256,string)",
        );
        const outer = decodeCombinator(args[1]);
        expect(outer.functionName).to.equal("calc");
        expect(outer.args[0]).to.equal(CALC_OP.Min);
        const inner = decodeCombinator(outer.args[2] as `0x${string}`);
        expect(inner.functionName).to.equal("calc");
        expect(inner.args[0]).to.equal(CALC_OP.Min);
        const last = decodeCombinator(outer.args[4] as `0x${string}`);
        expect(last.functionName).to.equal("env");
        expect(last.args[0]).to.equal(ENV_OP.Constant);
        expect(last.args[1]).to.equal(5n);
      },
    },
    {
      name: "compiles @absdiff! to calc(AbsDiff)",
      script: `assertions:assert @absdiff!(${TOKEN}::{supply()(uint256)} 100) <= 5`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLeCallUint(address,bytes,uint256,string)",
        );
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.AbsDiff);
      },
    },
    {
      name: "judges two live sides with calc(Gt) wrapped in assertTrue",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} > ${TOKEN}::{cap()(uint256)}`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const cmp = decodeCombinator(args[1]);
        expect(cmp.functionName).to.equal("calc");
        expect(cmp.args[0]).to.equal(CALC_OP.Gt);
      },
    },
    // ---- @bytes! / @not! -----------------------------------------------
    {
      name: "compiles @bytes! bitwise-and through calc(And)",
      script: `assertions:assert @bytes!(${TOKEN}::{flags()(bytes32)} "&" 0x00000000000000000000000000000000000000000000000000000000000000ff) == 3`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallUint(address,bytes,uint256,string)",
        );
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.And);
        expect(getAddress(calc.args[1] as string)).to.equal(TOKEN);
        const mask = decodeCombinator(calc.args[4] as `0x${string}`);
        expect(mask.functionName).to.equal("env");
        expect(mask.args[0]).to.equal(ENV_OP.Constant);
        expect(mask.args[1]).to.equal(0xffn);
      },
    },
    {
      name: "folds a constant @bytes! shift at build time",
      script: `assertions:assert ${TOKEN}::{supply()(uint256)} < @bytes!(1 "<<" 128)`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertLtCallUint(address,bytes,uint256,string)",
        );
        expect(args[2]).to.equal(1n << 128n);
      },
    },
    {
      name: "casts a live bool to its raw 0/1 word with single-arg @bytes!",
      script: `assertions:assert @num!(@bytes!(${TOKEN}::{paused()(bool)}) + 1) > 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Add);
        // The cast is free: the paused() call itself is the left operand.
        expect(getAddress(calc.args[1] as string)).to.equal(TOKEN);
      },
    },
    {
      name: "compiles @not! on a live bool to assertFalse on the inner call",
      script: `assertions:assert @not!(${TOKEN}::{paused()(bool)})`,
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
      name: "compiles @not! on a numeric value to unary(Not)",
      script: `assertions:assert @not!(${TOKEN}::{supply()(uint256)}) > 0`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("unary");
        expect(inner.args[0]).to.equal(UNARY_OP.Not);
        expect(getAddress(inner.args[1] as string)).to.equal(TOKEN);
      },
    },
    {
      name: "folds @not! on a bytes32 constant to its complement",
      script: `assertions:assert ${TOKEN}::{flags()(bytes32)} == @not!(0x00000000000000000000000000000000000000000000000000000000000000ff)`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallBytes32(address,bytes,bytes32,string)",
        );
        expect(args[2]).to.equal(`0x${"f".repeat(62)}00`);
      },
    },
    // ---- env getters -----------------------------------------------------
    {
      name: "compiles @chainid! to env(ChainId)",
      script: `assertions:assert @chainid! == 100 "wrong chain"`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallUint(address,bytes,uint256,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("env");
        expect(inner.args[0]).to.equal(ENV_OP.ChainId);
        expect(args[2]).to.equal(100n);
        expect(args[3]).to.equal("wrong chain");
      },
    },
    {
      name: "composes @chainid! inside arithmetic",
      script: `assertions:assert @num!(@chainid! + 1) > 100`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertGtCallUint(address,bytes,uint256,string)",
        );
        const calc = decodeCombinator(args[1]);
        expect(calc.functionName).to.equal("calc");
        expect(calc.args[0]).to.equal(CALC_OP.Add);
        const left = decodeCombinator(calc.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("env");
        expect(left.args[0]).to.equal(ENV_OP.ChainId);
        const right = decodeCombinator(calc.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("env");
        expect(right.args[0]).to.equal(ENV_OP.Constant);
        expect(right.args[1]).to.equal(1n);
      },
    },
    {
      name: "compiles @codehash! of a literal address to env(CodeHash)",
      script: `assertions:assert @codehash!(${TOKEN}) == 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertEqCallBytes32(address,bytes,bytes32,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("env");
        expect(inner.args[0]).to.equal(ENV_OP.CodeHash);
        expect(inner.args[1]).to.equal(BigInt(TOKEN));
        expect(args[2]).to.equal(
          "0x0102030405060708091011121314151617181920212223242526272829303132",
        );
      },
    },
    {
      name: "compiles @codehash! of a call-resolved address to unary(CodeHash)",
      script: `assertions:assert @codehash!(${TOKEN}::{implementation()(address)}) != 0x0102030405060708091011121314151617181920212223242526272829303132`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertNeCallBytes32(address,bytes,bytes32,string)",
        );
        expect(getAddress(args[0])).to.equal(COMBINATORS);
        const inner = decodeCombinator(args[1]);
        expect(inner.functionName).to.equal("unary");
        expect(inner.args[0]).to.equal(UNARY_OP.CodeHash);
        expect(getAddress(inner.args[1] as string)).to.equal(TOKEN);
        expect(
          (inner.args[2] as string).startsWith(selectorOf("implementation()")),
        ).to.be.true;
      },
    },
    {
      name: "judges two live @codehash! sides with calc(Eq)",
      script: `assertions:assert @codehash!(${TOKEN}) == @codehash!(${HOLDER})`,
      validate: (actions) => {
        const args = decodeCore(
          actions,
          ASSERTIONS,
          "assertTrue(address,bytes,string)",
        );
        const cmp = decodeCombinator(args[1]);
        expect(cmp.functionName).to.equal("calc");
        expect(cmp.args[0]).to.equal(CALC_OP.Eq);
        const left = decodeCombinator(cmp.args[2] as `0x${string}`);
        expect(left.functionName).to.equal("env");
        expect(left.args[0]).to.equal(ENV_OP.CodeHash);
        expect(left.args[1]).to.equal(BigInt(TOKEN));
        const right = decodeCombinator(cmp.args[4] as `0x${string}`);
        expect(right.functionName).to.equal("env");
        expect(right.args[0]).to.equal(ENV_OP.CodeHash);
        expect(right.args[1]).to.equal(BigInt(HOLDER));
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
      name: "rejects an element lens on a non-final chained call",
      script: `assertions:assert ${TOKEN}::{signers()(address[],address)}[[$]]::{decimals()(uint256)} == 18`,
      error: "apply only to the final call",
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
      error: "must land on a single-word static value",
    },
    {
      name: "rejects @len! over a lens selecting a word",
      script: `assertions:assert @len!(${TOKEN}::{signers()(address[],address)}[_ $]) > 0`,
      error: "must select a string, bytes or array value",
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
          getAddress("0xA55Ec0AA973C18Cb7D7874d4c52B663FFFf6b1dC"),
        );
      },
    },
  ],
});
