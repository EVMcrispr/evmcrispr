import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { ComparisonType, NodeType } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../test-helpers/evml";

describe.skip("Giveth > helpers > @projectAddr(slug)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("return the hashed value", async () => {
    const [interpret] = await preparingExpression(
      `@projectAddr(evmcrispr)`,
      client,
      "giveth",
    );

    expect(await interpret()).to.equals(
      "0xeafFF6dB1965886348657E79195EB6f1A84657eB",
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@projectAddr",
    ["evmcrispr"],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazyClient,
    "giveth",
  );
});
