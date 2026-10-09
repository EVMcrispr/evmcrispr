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
const REGISTRY = getAddress("0x00000000000000000000000000000000000d0600");
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
    module: "vault",
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

const VAULT = getAddress("0x00000000000000000000000000000000000d0601");

test("vault reads resolve against the address a call returns", async () => {
  for (const [expression, want] of [
    [`@vault:totalAssets!(${LIVE})`, 7n],
    [`@vault:convertToAssets!(${LIVE} 100)`, 7n],
    [`@vault:convertToShares!(${LIVE} ${VAULT}::!{count()(uint256)})`, 7n],
    [`@vault:maxWithdraw!(${LIVE} ${ACCOUNT})`, 7n],
    [`@vault:pendingDeposit!(${LIVE} ${ACCOUNT})`, 7n],
  ] as const) {
    expect(
      await resolved(expression, "uint256", VAULT, uint(7n)),
      expression,
    ).to.equal(want);
  }
  const asset = "0x00000000000000000000000000000000000d0602";
  expect(
    await resolved(`@vault:asset!(${LIVE})`, "address", VAULT, address(asset)),
  ).to.equal(getAddress(asset));
  // share() answers on this mock, so the fallback to the vault is not taken.
  expect(
    await resolved(`@vault:share!(${LIVE})`, "address", VAULT, address(asset)),
  ).to.equal(getAddress(asset));
  expect(
    await resolved(
      `@vault:isOperator!(${LIVE} ${ACCOUNT} ${REGISTRY})`,
      "bool",
      VAULT,
      bool(true),
    ),
  ).to.equal(true);
});
