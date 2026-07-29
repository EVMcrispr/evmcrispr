import "../../setup";
import { describe, it } from "bun:test";
import { isTransactionAction } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { createInterpreter } from "@evmcrispr/test-utils/evml";
import { type Address, getAddress, toFunctionSelector } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const ACCOUNT = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

const preamble = `load assertions\nset $assertions:address ${ASSERTIONS}`;

function selectorOf(signature: string): string {
  return toFunctionSelector(`function ${signature}`);
}

describe("Assertions > commands > state-based", () => {
  const run = async (line: string) => {
    const interpreter = createInterpreter(
      `${preamble}\n${line}`,
      getPublicClient(),
    );
    return interpreter.interpret();
  };

  const expectReadOnly = (actions: any[], signature: string) => {
    expect(actions).to.have.lengthOf(1);
    const action = actions[0];
    expect(isTransactionAction(action)).to.be.true;
    expect(action.readOnly).to.equal(true);
    expect(getAddress(action.to as Address)).to.equal(ASSERTIONS);
    expect((action.data as string).startsWith(selectorOf(signature))).to.be
      .true;
  };

  it("assert-balance encodes a > comparison", async () => {
    const actions = await run(`assertions:assert-balance ${ACCOUNT} > 1e18`);
    expectReadOnly(actions, "assertGtBalance(address,uint256,string)");
  });

  it("assert-balance supports ~= with --delta", async () => {
    const actions = await run(
      `assertions:assert-balance ${ACCOUNT} ~= 1e18 --delta 1e17`,
    );
    expectReadOnly(
      actions,
      "assertApproxEqBalance(address,uint256,uint256,string)",
    );
  });

  it("assert-block-number encodes a >= comparison", async () => {
    const actions = await run(`assertions:assert-block-number >= 21000000`);
    expectReadOnly(actions, "assertGeBlockNumber(uint256,string)");
  });

  it("assert-timestamp encodes a >= comparison", async () => {
    const actions = await run(`assertions:assert-timestamp >= 1893456000`);
    expectReadOnly(actions, "assertGeBlockTimestamp(uint256,string)");
  });

  it("assert-chainid encodes an equality check", async () => {
    const actions = await run(`assertions:assert-chainid 1`);
    expectReadOnly(actions, "assertEqChainId(uint256,string)");
  });

  it("assert-code encodes a has-code check", async () => {
    const actions = await run(`assertions:assert-code ${ACCOUNT}`);
    expectReadOnly(actions, "assertHasCode(address,string)");
  });

  it("assert-no-code encodes a no-code check", async () => {
    const actions = await run(`assertions:assert-no-code ${ACCOUNT}`);
    expectReadOnly(actions, "assertNoCode(address,string)");
  });

  it("assert-codehash encodes a code-hash check", async () => {
    const actions = await run(
      `assertions:assert-codehash ${ACCOUNT} 0x0000000000000000000000000000000000000000000000000000000000000000`,
    );
    expectReadOnly(actions, "assertEqCodeHash(address,bytes32,string)");
  });
});
