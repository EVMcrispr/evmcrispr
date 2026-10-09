import "../../setup";
import { test } from "bun:test";
import { encodeResolve } from "@evmcrispr/sdk/onchain";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import {
  compileExpression,
  installAssertionsCore,
  installConstantMock,
} from "@evmcrispr/test-utils/onchain";
import {
  type Address,
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  type Hex,
} from "viem";

// A contract that is only known when the assertion runs: the address a
// call returns. Each mock answers every call with the same data, so it
// stands for the contract as one read sees it; the registry names it.
const REGISTRY = getAddress("0x00000000000000000000000000000000000d0800");
const LIVE = `${REGISTRY}::!{target()(address)}`;

async function resolved(
  expression: string,
  type: string,
  contract: Address,
  returns: Hex,
) {
  const client = getPublicClient();
  await installAssertionsCore(client);
  await installConstantMock(client, contract, returns);
  await installConstantMock(
    client,
    REGISTRY,
    encodeAbiParameters([{ type: "address" }], [contract]),
  );
  const { operand, ctx } = await compileExpression(expression, {
    module: "governor",
  });
  if (operand.kind !== "call") throw new Error("expected a live operand");
  const { data } = await client.call({
    to: ctx.core,
    data: encodeResolve(operand.param),
  });
  return decodeAbiParameters([{ type }], data as Hex)[0];
}

const uint = (value: bigint) =>
  encodeAbiParameters([{ type: "uint256" }], [value]);
const bool = (value: boolean) =>
  encodeAbiParameters([{ type: "bool" }], [value]);

const GOVERNOR = getAddress("0x00000000000000000000000000000000000d0801");

test("governor reads resolve against the address a call returns", async () => {
  for (const [expression, want] of [
    [`@governor:proposalState!(${LIVE} 42)`, 4n],
    [`@governor:timelockMinDelay!(${LIVE})`, 4n],
  ] as const) {
    expect(
      await resolved(expression, "uint256", GOVERNOR, uint(4n)),
      expression,
    ).to.equal(want);
  }
  // Every view of the mock answers true: the operation reads as Done (3),
  // with the id fixed and with the id read from a call.
  for (const expression of [
    `@governor:timelockOperationState!(${LIVE} 0x${"11".repeat(32)})`,
    `@governor:timelockOperationState!(${LIVE} ${GOVERNOR}::!{id()(bytes32)})`,
  ]) {
    expect(
      await resolved(expression, "uint256", GOVERNOR, bool(true)),
      expression,
    ).to.equal(3n);
  }
});
