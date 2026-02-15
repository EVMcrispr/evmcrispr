import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { ComparisonType, HelperFunctionError, NodeType } from "@evmcrispr/sdk";
import {
  expect,
  expectThrowAsync,
  getPublicClient,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { namehash } from "viem";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../test-helpers/evml";

describe("Std > helpers > @namehash(ens)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("return the ENS node value", async () => {
    const [interpret] = await preparingExpression(
      `@namehash(evmcrispr.eth)`,
      client,
    );

    expect(await interpret()).to.equals(namehash("evmcrispr.eth"));
  });

  it("fails if the value is not an ENS domain", async () => {
    const [interpret, h] = await preparingExpression(
      `@namehash('not an ens domain')`,
      client,
    );

    const error = new HelperFunctionError(
      h,
      "Invalid ENS name. Please check the value you are passing to @namehash",
    );

    await expectThrowAsync(async () => interpret(), error);
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@namehash",
    ["evmcrispr.eth"],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazyClient,
  );
});
