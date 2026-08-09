import "../../setup";
import { describe, it } from "bun:test";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  encodePacked,
  getAddress,
  keccak256,
  numberToHex,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { CORE_ABI } from "../../../src/lib/core";
import {
  ASSERTIONS_ABI,
  CONSTRAINT_TYPE,
  FETCHER_TYPE,
} from "../../../src/lib/erc8211";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const OPERATORS = getAddress("0x000000000000000000000000000000000097e7a7");
const ACCOUNT = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

const preamble = `load assertions\nset $assertions:address ${ASSERTIONS}\nset $assertions:operators ${OPERATORS}`;

const WORD_MASK = (1n << 256n) - 1n;
const word = (v: bigint) => numberToHex(v & WORD_MASK, { size: 32 });

function selectorOf(signature: string): `0x${string}` {
  return toFunctionSelector(`function ${signature}`);
}

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

describe("Assertions > commands > state-based", () => {
  const run = async (line: string) => {
    const interpreter = createInterpreter(
      `${preamble}\n${line}`,
      getPublicClient(),
    );
    return interpreter.interpret();
  };

  const decodeAssertParam = (
    actions: any[],
  ): { param: Param; message: string } => {
    expect(actions).to.have.lengthOf(1);
    const action = actions[0];
    expect(isTransactionAction(action)).to.be.true;
    expect(action.readOnly).to.equal(true);
    expect(getAddress(action.to as Address)).to.equal(ASSERTIONS);
    const { functionName, args } = decodeFunctionData({
      abi: ASSERTIONS_ABI,
      data: action.data,
    });
    expect(functionName).to.equal("assertParam");
    return {
      param: args[0] as unknown as Param,
      message: (args.length > 1 ? args[1] : "") as string,
    };
  };

  const staticCallOf = (
    param: Param,
  ): { target: Address; data: `0x${string}` } => {
    expect(param.fetcherType).to.equal(FETCHER_TYPE.StaticCall);
    const [target, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      param.paramData,
    ) as [Address, `0x${string}`];
    return { target: getAddress(target), data };
  };

  /** A plain Operators call (no arguments to splice): a STATIC_CALL
   *  fetcher pointed straight at the operators address. */
  const opsDirect = (param: Param): `0x${string}` => {
    const { target, data } = staticCallOf(param);
    expect(target).to.equal(OPERATORS);
    return data;
  };

  /** Decode a param as read(operators, opSignature, args) at the core. */
  const opReadOf = (param: Param, signature: string): readonly Param[] => {
    const { target, data } = staticCallOf(param);
    expect(target).to.equal(ASSERTIONS);
    const call = decodeFunctionData({ abi: CORE_ABI, data });
    expect(call.functionName).to.equal("read");
    const readTarget = call.args[0] as unknown as Param;
    expect(readTarget.fetcherType).to.equal(FETCHER_TYPE.RawBytes);
    expect(BigInt(readTarget.paramData)).to.equal(BigInt(OPERATORS));
    expect(call.args[1]).to.equal(selectorOf(signature));
    return call.args[2] as unknown as readonly Param[];
  };

  const expectConstraint = (
    param: Param,
    type: keyof typeof CONSTRAINT_TYPE,
    value: bigint,
  ) => {
    expect(param.constraints).to.have.lengthOf(1);
    expect(param.constraints[0].constraintType).to.equal(CONSTRAINT_TYPE[type]);
    expect(BigInt(param.constraints[0].referenceData)).to.equal(
      value & WORD_MASK,
    );
  };

  it("assert-balance encodes a > comparison over the BALANCE fetcher", async () => {
    const actions = await run(`assertions:assert-balance ${ACCOUNT} > 1e18`);
    const { param } = decodeAssertParam(actions);
    expect(param.fetcherType).to.equal(FETCHER_TYPE.Balance);
    expect(param.paramData).to.equal(
      encodePacked(["address", "address"], [zeroAddress, ACCOUNT]),
    );
    expectConstraint(param, "Gte", 10n ** 18n + 1n);
  });

  it("assert-balance supports ~= with --delta via an IN constraint", async () => {
    const actions = await run(
      `assertions:assert-balance ${ACCOUNT} ~= 1e18 --delta 1e17`,
    );
    const { param } = decodeAssertParam(actions);
    expect(param.fetcherType).to.equal(FETCHER_TYPE.Balance);
    expect(param.constraints).to.have.lengthOf(1);
    expect(param.constraints[0].constraintType).to.equal(CONSTRAINT_TYPE.In);
    expect(param.constraints[0].referenceData).to.equal(
      `0x${word(9n * 10n ** 17n).slice(2)}${word(11n * 10n ** 17n).slice(2)}`,
    );
  });

  it("assert-block-number encodes a >= comparison over a plain blockNumber read", async () => {
    const actions = await run(`assertions:assert-block-number >= 21000000`);
    const { param } = decodeAssertParam(actions);
    expect(opsDirect(param)).to.equal(selectorOf("blockNumber()"));
    expectConstraint(param, "Gte", 21000000n);
  });

  it("assert-timestamp encodes a >= comparison over a plain timestamp read", async () => {
    const actions = await run(`assertions:assert-timestamp >= 1893456000`);
    const { param } = decodeAssertParam(actions);
    expect(opsDirect(param)).to.equal(selectorOf("timestamp()"));
    expectConstraint(param, "Gte", 1893456000n);
  });

  it("assert-chainid encodes an equality check over a plain chainId read", async () => {
    const actions = await run(`assertions:assert-chainid 1`);
    const { param } = decodeAssertParam(actions);
    expect(opsDirect(param)).to.equal(selectorOf("chainId()"));
    expectConstraint(param, "Eq", 1n);
  });

  it("assert-code composes codehash != 0 && codehash != keccak256('')", async () => {
    const actions = await run(`assertions:assert-code ${ACCOUNT}`);
    const { param } = decodeAssertParam(actions);
    expectConstraint(param, "Eq", 1n);
    const gate = opReadOf(param, "bitAnd(uint256,uint256)");
    expect(gate).to.have.lengthOf(2);
    const nonZero = opReadOf(gate[0], "ne(uint256,uint256)");
    expect(opsDirect(nonZero[0])).to.equal(
      `${selectorOf("codehash(address)")}${word(BigInt(ACCOUNT)).slice(2)}`,
    );
    expect(BigInt(nonZero[1].paramData)).to.equal(0n);
    const nonEmpty = opReadOf(gate[1], "ne(uint256,uint256)");
    expect(BigInt(nonEmpty[1].paramData)).to.equal(BigInt(keccak256("0x")));
  });

  it("assert-no-code composes codehash == 0 || codehash == keccak256('')", async () => {
    const actions = await run(`assertions:assert-no-code ${ACCOUNT}`);
    const { param } = decodeAssertParam(actions);
    expectConstraint(param, "Eq", 1n);
    const gate = opReadOf(param, "bitOr(uint256,uint256)");
    const isZero = opReadOf(gate[0], "eq(uint256,uint256)");
    expect(BigInt(isZero[1].paramData)).to.equal(0n);
  });

  it("assert-codehash encodes an EQ check over a plain codehash read", async () => {
    const actions = await run(
      `assertions:assert-codehash ${ACCOUNT} 0x0102030405060708091011121314151617181920212223242526272829303132`,
    );
    const { param } = decodeAssertParam(actions);
    expect(opsDirect(param)).to.equal(
      `${selectorOf("codehash(address)")}${word(BigInt(ACCOUNT)).slice(2)}`,
    );
    expectConstraint(
      param,
      "Eq",
      BigInt(
        "0x0102030405060708091011121314151617181920212223242526272829303132",
      ),
    );
  });
});
