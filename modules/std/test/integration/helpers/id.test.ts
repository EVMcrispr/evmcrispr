import "../../setup";
import { beforeAll, describe, it } from "bun:test";
import { ComparisonType, NodeType } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import type { PublicClient } from "viem";
import { keccak256, toHex } from "viem";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../test-helpers/evml";

describe("Std > helpers > @id(value)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("return the hashed value", async () => {
    const [interpret] = await preparingExpression(
      `@id('an example test')`,
      client,
    );

    expect(await interpret()).to.equals(keccak256(toHex("an example test")));
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@id",
    ["exampleValue"],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazyClient,
  );
});
