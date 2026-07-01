import "../../setup";
import { isTransactionAction } from "@evmcrispr/sdk";
import { describeCommand, expect } from "@evmcrispr/test-utils";
import { type Address, getAddress, toFunctionSelector } from "viem";

const ASSERTIONS = getAddress("0x00000000000000000000000000000000000a55e7");
const TOKEN = getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const HOLDER = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

const preamble = `load assertions\nset $assertions.address ${ASSERTIONS}`;

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
}

describeCommand("assert", {
  describeName: "Assertions > commands > assert",
  preamble,
  cases: [
    {
      name: "encodes a >= comparison on a uint return (inline ABI)",
      script: `assertions:assert ${TOKEN}::{balanceOf(address)(uint256) ${HOLDER}} >= 10e18 "insufficient"`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertGeCallUint(address,bytes,uint256,string)",
        ),
    },
    {
      name: "selects a tuple element with a destructure lens (N variant)",
      script: `assertions:assert ${TOKEN}::{getReserves()(uint112,uint112,uint32)}[_ $ _] >= 1000 "low reserve"`,
      validate: (actions) =>
        expectReadOnlyTo(
          actions,
          ASSERTIONS,
          "assertGeCallUintN(address,bytes,uint256,uint256,string)",
        ),
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
  ],
  errorCases: [
    {
      name: "rejects a non-call first argument",
      script: `assertions:assert 10 >= 5`,
      error: "call expression",
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
  ],
});
