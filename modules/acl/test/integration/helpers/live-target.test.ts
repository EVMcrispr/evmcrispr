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
const REGISTRY = getAddress("0x00000000000000000000000000000000000d0700");
const LIVE = `${REGISTRY}::!{target()(address)}`;
const ACCOUNT = getAddress("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");

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
    module: "acl",
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
const address = (value: string) =>
  encodeAbiParameters([{ type: "address" }], [getAddress(value)]);

const CONTRACT = getAddress("0x00000000000000000000000000000000000d0701");

test("access reads resolve against the address a call returns", async () => {
  const owner = "0x00000000000000000000000000000000000d0702";
  for (const expression of [
    `@acl:owner!(${LIVE})`,
    `@acl:pendingOwner!(${LIVE})`,
    `@acl:defaultAdmin!(${LIVE})`,
    // (newAdmin, acceptSchedule): the address is word 0 of the pair.
    `@acl:pendingDefaultAdmin!(${LIVE})`,
  ]) {
    expect(
      await resolved(expression, "address", CONTRACT, address(owner)),
      expression,
    ).to.equal(getAddress(owner));
  }
  for (const expression of [
    // The account asked about is a call too.
    `@acl:hasRole!(${LIVE} MINTER_ROLE ${CONTRACT}::!{who()(address)})`,
    `@acl:hasRole!(${LIVE} 7 ${ACCOUNT})`,
    `@acl:canCall!(${LIVE} ${ACCOUNT} ${CONTRACT}::!{who()(address)} "mint(address,uint256)")`,
  ]) {
    expect(
      await resolved(expression, "bool", CONTRACT, bool(true)),
      expression,
    ).to.equal(true);
  }
  expect(
    await resolved(
      `@acl:defaultAdminDelay!(${LIVE})`,
      "uint256",
      CONTRACT,
      uint(9n),
    ),
  ).to.equal(9n);
  expect(
    await resolved(
      `@acl:operationSchedule!(${LIVE} ${CONTRACT}::!{id()(bytes32)})`,
      "uint256",
      CONTRACT,
      uint(9n),
    ),
  ).to.equal(9n);
});
