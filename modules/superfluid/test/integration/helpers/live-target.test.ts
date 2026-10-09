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
const REGISTRY = getAddress("0x00000000000000000000000000000000000d0900");
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
    module: "superfluid",
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

const address = (value: string) =>
  encodeAbiParameters([{ type: "address" }], [getAddress(value)]);

const POOL = getAddress("0x00000000000000000000000000000000000d0901");

test("pool and SuperToken reads resolve against the address a call returns", async () => {
  for (const expression of [
    `@superfluid:totalUnits!(${LIVE})`,
    `@superfluid:units!(${LIVE} ${ACCOUNT})`,
    `@superfluid:memberFlowrate!(${LIVE} ${ACCOUNT})`,
    // getClaimableNow returns a pair: the claimable amount is word 0.
    `@superfluid:claimable!(${LIVE} ${ACCOUNT})`,
    // realtimeBalanceOfNow: the available balance is word 0.
    `@superfluid:balance!(${LIVE} ${ACCOUNT})`,
  ]) {
    expect(
      await resolved(expression, "uint256", POOL, uint(8n)),
      expression,
    ).to.equal(8n);
  }
  const underlying = "0x00000000000000000000000000000000000d0902";
  expect(
    await resolved(
      `@superfluid:underlying!(${LIVE})`,
      "address",
      POOL,
      address(underlying),
    ),
  ).to.equal(getAddress(underlying));
});
