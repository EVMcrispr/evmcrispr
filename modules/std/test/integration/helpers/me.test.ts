import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { ComparisonType, NodeType } from "@evmcrispr/sdk";
import {
  expect,
  getPublicClient,
  TEST_ACCOUNT_ADDRESS,
} from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../test-helpers/evml";

describe("Std > helpers > @me", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("should return the current connected account", async () => {
    const [interpret] = await preparingExpression(`@me`, client);

    expect(await interpret()).to.equals(TEST_ACCOUNT_ADDRESS);
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@me",
    [],
    { type: ComparisonType.Equal, minValue: 0 },
    lazyClient,
  );
});
