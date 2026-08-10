/**
 * Decoders for `assert` actions — the shared vocabulary of the
 * on-chain (`!`) helper-face tests. Module suites pin the emitted
 * calldata byte-exactly: every fold template, ABI offset and envelope
 * splice is validated against the recipes' documented layout.
 */
import { isTransactionAction } from "@evmcrispr/sdk";
import {
  ASSERTIONS_ABI,
  CONSTRAINT_TYPE,
  CORE_ABI,
  CORE_ADDRESS,
  FETCHER_TYPE,
  OPERATORS_ADDRESS,
} from "@evmcrispr/sdk/onchain";
import { expect } from "chai";
import type { Address, Hex } from "viem";
import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  keccak256,
  numberToHex,
  stringToHex,
  toFunctionSelector,
} from "viem";

const WORD_MASK = (1n << 256n) - 1n;

/** A value as its raw 32-byte word (negatives as two's complement). */
export const word = (v: bigint): Hex =>
  numberToHex(v & WORD_MASK, { size: 32 });

export interface DecodedConstraint {
  constraintType: number;
  referenceData: Hex;
}

export interface DecodedParam {
  paramType: number;
  fetcherType: number;
  paramData: Hex;
  constraints: readonly DecodedConstraint[];
}

export function selectorOf(signature: string): Hex {
  return toFunctionSelector(`function ${signature}`);
}

/** keccak256 of a string's raw UTF-8 payload bytes — what `hash` computes
 *  over a spliced live string return. */
export const stringDigest = (s: string): Hex => keccak256(stringToHex(s));

export interface AssertDecoders {
  theAction(actions: any[], to?: Address): any;
  /** Decode the emitted action as assertParam(param[, message]). */
  decodeAssert(
    actions: any[],
    to?: Address,
  ): { param: DecodedParam; message: string };
  /** Decode a STATIC_CALL param's (target, calldata). */
  staticCallOf(param: DecodedParam): { target: Address; data: Hex };
  /** Decode a param as a core-primitive call (STATIC_CALL to the core). */
  core(
    param: DecodedParam,
    at?: Address,
  ): ReturnType<typeof decodeFunctionData>;
  /** A param pointed straight at the Operators contract — its calldata. */
  opsDirect(param: DecodedParam, at?: Address): Hex;
  expectConstraint(
    param: DecodedParam,
    type: keyof typeof CONSTRAINT_TYPE,
    value: bigint,
  ): void;
  expectIn(param: DecodedParam, lower: bigint, upper: bigint): void;
  expectRawWord(param: DecodedParam, value: bigint): void;
  /** Decode a param as core.read: target, selector, calldata segments. */
  readOf(param: DecodedParam): {
    target: DecodedParam;
    selector: Hex;
    segments: readonly DecodedParam[];
  };
  /** Decode a param as read(operators, opSignature, args). */
  opReadOf(param: DecodedParam, signature: string): readonly DecodedParam[];
  /** A binary operator read judged EQ 1. */
  expectOpJudge(
    param: DecodedParam,
    signature: string,
  ): { a: DecodedParam; b: DecodedParam };
}

/** Build the decoder set against the canonical core/operators addresses —
 *  the only ones a compiled expression ever targets. A suite that installs
 *  the contracts somewhere else passes those addresses instead. */
export function createAssertDecoders(
  addresses: { assertions: Address; operators: Address } = {
    assertions: CORE_ADDRESS,
    operators: OPERATORS_ADDRESS,
  },
): AssertDecoders {
  const ASSERTIONS = getAddress(addresses.assertions);
  const OPERATORS = getAddress(addresses.operators);

  const theAction = (actions: any[], to: Address = ASSERTIONS) => {
    expect(actions).to.have.lengthOf(1);
    const action = actions[0];
    expect(isTransactionAction(action), "expected a transaction action").to.be
      .true;
    expect(action.readOnly, "expected readOnly flag").to.equal(true);
    expect(getAddress(action.to)).to.equal(to);
    return action;
  };

  const decodeAssert = (actions: any[], to: Address = ASSERTIONS) => {
    const action = theAction(actions, to);
    const { functionName, args } = decodeFunctionData({
      abi: ASSERTIONS_ABI,
      data: action.data,
    });
    expect(functionName).to.equal("assertParam");
    return {
      param: args[0] as unknown as DecodedParam,
      message: (args.length > 1 ? args[1] : "") as string,
    };
  };

  const staticCallOf = (param: DecodedParam) => {
    expect(param.fetcherType, "expected a STATIC_CALL fetcher").to.equal(
      FETCHER_TYPE.StaticCall,
    );
    const [target, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      param.paramData,
    ) as [Address, Hex];
    return { target: getAddress(target), data };
  };

  const core = (param: DecodedParam, at: Address = ASSERTIONS) => {
    const { target, data } = staticCallOf(param);
    expect(target).to.equal(at);
    return decodeFunctionData({ abi: CORE_ABI, data });
  };

  const opsDirect = (param: DecodedParam, at: Address = OPERATORS): Hex => {
    const { target, data } = staticCallOf(param);
    expect(target).to.equal(at);
    return data;
  };

  const expectConstraint = (
    param: DecodedParam,
    type: keyof typeof CONSTRAINT_TYPE,
    value: bigint,
  ) => {
    expect(param.constraints).to.have.lengthOf(1);
    const c = param.constraints[0];
    expect(c.constraintType).to.equal(CONSTRAINT_TYPE[type]);
    expect(BigInt(c.referenceData)).to.equal(value & WORD_MASK);
  };

  const expectIn = (param: DecodedParam, lower: bigint, upper: bigint) => {
    expect(param.constraints).to.have.lengthOf(1);
    const c = param.constraints[0];
    expect(c.constraintType).to.equal(CONSTRAINT_TYPE.In);
    expect(c.referenceData).to.equal(
      `0x${word(lower).slice(2)}${word(upper).slice(2)}`,
    );
  };

  const expectRawWord = (param: DecodedParam, value: bigint) => {
    expect(param.fetcherType).to.equal(FETCHER_TYPE.RawBytes);
    expect(BigInt(param.paramData)).to.equal(value & WORD_MASK);
  };

  const readOf = (param: DecodedParam) => {
    const call = core(param);
    expect(call.functionName).to.equal("read");
    return {
      target: call.args[0] as unknown as DecodedParam,
      selector: call.args[1] as Hex,
      segments: call.args[2] as unknown as readonly DecodedParam[],
    };
  };

  const opReadOf = (param: DecodedParam, signature: string) => {
    const { target, selector, segments } = readOf(param);
    expectRawWord(target, BigInt(OPERATORS));
    expect(selector).to.equal(selectorOf(signature));
    return segments;
  };

  const expectOpJudge = (param: DecodedParam, signature: string) => {
    expectConstraint(param, "Eq", 1n);
    const args = opReadOf(param, signature);
    expect(args).to.have.lengthOf(2);
    return { a: args[0], b: args[1] };
  };

  return {
    theAction,
    decodeAssert,
    staticCallOf,
    core,
    opsDirect,
    expectConstraint,
    expectIn,
    expectRawWord,
    readOf,
    opReadOf,
    expectOpJudge,
  };
}
