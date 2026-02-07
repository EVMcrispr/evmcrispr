import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";
import { keccak256, toHex } from "viem";

import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/evml";

describe("Std > helpers > @id(value)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
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
