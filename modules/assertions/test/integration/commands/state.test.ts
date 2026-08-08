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
  zeroAddress,
} from "viem";
import { CALC_OP, COMBINATORS_ABI, ENV_OP } from "../../../src/lib/combinators";
import {
  ASSERTIONS_ABI,
  CONSTRAINT_TYPE,
  FETCHER_TYPE,
} from "../../../src/lib/erc8211";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const COMBINATORS = getAddress("0x00000000000000000000000000000000c0b1a705");
const ACCOUNT = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

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

  const combinator = (param: Param) => {
    expect(param.fetcherType).to.equal(FETCHER_TYPE.StaticCall);
    const [target, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      param.paramData,
    ) as [Address, `0x${string}`];
    expect(getAddress(target)).to.equal(COMBINATORS);
    return decodeFunctionData({ abi: COMBINATORS_ABI, data });
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

  it("assert-block-number encodes a >= comparison over env(BlockNumber)", async () => {
    const actions = await run(`assertions:assert-block-number >= 21000000`);
    const { param } = decodeAssertParam(actions);
    const env = combinator(param);
    expect(env.functionName).to.equal("env");
    expect(env.args[0]).to.equal(ENV_OP.BlockNumber);
    expectConstraint(param, "Gte", 21000000n);
  });

  it("assert-timestamp encodes a >= comparison over env(Timestamp)", async () => {
    const actions = await run(`assertions:assert-timestamp >= 1893456000`);
    const { param } = decodeAssertParam(actions);
    const env = combinator(param);
    expect(env.functionName).to.equal("env");
    expect(env.args[0]).to.equal(ENV_OP.Timestamp);
    expectConstraint(param, "Gte", 1893456000n);
  });

  it("assert-chainid encodes an equality check over env(ChainId)", async () => {
    const actions = await run(`assertions:assert-chainid 1`);
    const { param } = decodeAssertParam(actions);
    const env = combinator(param);
    expect(env.functionName).to.equal("env");
    expect(env.args[0]).to.equal(ENV_OP.ChainId);
    expectConstraint(param, "Eq", 1n);
  });

  it("assert-code composes codehash != 0 && codehash != keccak256('')", async () => {
    const actions = await run(`assertions:assert-code ${ACCOUNT}`);
    const { param } = decodeAssertParam(actions);
    expectConstraint(param, "Eq", 1n);
    const gate = combinator(param);
    expect(gate.functionName).to.equal("calc");
    expect(gate.args[0]).to.equal(CALC_OP.And);
    const nonZero = combinator(gate.args[1] as unknown as Param);
    expect(nonZero.functionName).to.equal("calc");
    expect(nonZero.args[0]).to.equal(CALC_OP.Ne);
    const codehash = combinator(nonZero.args[1] as unknown as Param);
    expect(codehash.functionName).to.equal("env");
    expect(codehash.args[0]).to.equal(ENV_OP.CodeHash);
    expect(codehash.args[1]).to.equal(BigInt(ACCOUNT));
    const nonEmpty = combinator(gate.args[2] as unknown as Param);
    expect(nonEmpty.args[0]).to.equal(CALC_OP.Ne);
    const emptyHash = nonEmpty.args[2] as unknown as Param;
    expect(BigInt(emptyHash.paramData)).to.equal(BigInt(keccak256("0x")));
  });

  it("assert-no-code composes codehash == 0 || codehash == keccak256('')", async () => {
    const actions = await run(`assertions:assert-no-code ${ACCOUNT}`);
    const { param } = decodeAssertParam(actions);
    expectConstraint(param, "Eq", 1n);
    const gate = combinator(param);
    expect(gate.functionName).to.equal("calc");
    expect(gate.args[0]).to.equal(CALC_OP.Or);
    const isZero = combinator(gate.args[1] as unknown as Param);
    expect(isZero.args[0]).to.equal(CALC_OP.Eq);
  });

  it("assert-codehash encodes an EQ check over env(CodeHash)", async () => {
    const actions = await run(
      `assertions:assert-codehash ${ACCOUNT} 0x0102030405060708091011121314151617181920212223242526272829303132`,
    );
    const { param } = decodeAssertParam(actions);
    const env = combinator(param);
    expect(env.functionName).to.equal("env");
    expect(env.args[0]).to.equal(ENV_OP.CodeHash);
    expect(env.args[1]).to.equal(BigInt(ACCOUNT));
    expectConstraint(
      param,
      "Eq",
      BigInt(
        "0x0102030405060708091011121314151617181920212223242526272829303132",
      ),
    );
  });
});
