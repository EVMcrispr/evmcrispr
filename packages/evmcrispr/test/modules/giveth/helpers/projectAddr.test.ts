import { expect } from "chai";
import { viem } from "hardhat";
import type { PublicClient } from "viem";

import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/evml";

describe("Giveth > helpers > @projectAddr(slug)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
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
