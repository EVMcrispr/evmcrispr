import { expect } from "chai";
import { viem } from "hardhat";

import type { PublicClient } from "viem";
import { namehash } from "viem";

import { HelperFunctionError } from "../../../../src/errors";

import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";

describe("Std > helpers > @namehash(ens)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  before(async () => {
    client = await viem.getPublicClient();
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
