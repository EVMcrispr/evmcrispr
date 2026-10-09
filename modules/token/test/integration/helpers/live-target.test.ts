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
const REGISTRY = getAddress("0x00000000000000000000000000000000000d0500");
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
    module: "token",
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

const TOKEN = getAddress("0x00000000000000000000000000000000000d0501");

test("token reads resolve against the address a call returns", async () => {
  // Every read of the mock answers 6: its decimals, its supply, an allowance.
  for (const [expression, want] of [
    [`@token:decimals!(${LIVE})`, 6n],
    [`@token:totalSupply!(${LIVE})`, 6n],
    [`@token:allowance!(${LIVE} ${ACCOUNT} ${REGISTRY})`, 6n],
    // 2.5 tokens at 6 decimals.
    [`@token:amount!(${LIVE} 2.5)`, 2_500_000n],
    // A live amount: the mock's own answer (6) whole tokens, at 6 decimals.
    [`@token:amount!(${LIVE} ${TOKEN}::!{count()(uint256)})`, 6_000_000n],
    [`@balance!(${LIVE} ${ACCOUNT})`, 6n],
    // A fixed token, read for an account a call returns.
    [`@balance!(${TOKEN} ${REGISTRY}::!{target()(address)})`, 6n],
  ] as const) {
    expect(
      await resolved(expression, "uint256", TOKEN, uint(6n)),
      expression,
    ).to.equal(want);
  }
});
