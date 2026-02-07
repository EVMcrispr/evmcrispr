import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";

import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";
import { TEST_ACCOUNT_ADDRESS } from "../../../test-helpers/constants";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/evml";

describe("Std > helpers > @me", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
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
