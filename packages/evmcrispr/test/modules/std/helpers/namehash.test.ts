import { expect } from "chai";
import type { Signer } from "ethers";
import { utils } from "ethers";
import { ethers } from "hardhat";

import { HelperFunctionError } from "../../../../src/errors";

import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";

import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";

describe("Std > helpers > @namehash(ens)", () => {
  let signer: Signer;
  const lazySigner = () => signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  it("return the ENS node value", async () => {
    const [interpret] = await preparingExpression(
      `@namehash(evmcrispr.eth)`,
      signer,
    );

    expect(await interpret()).to.equals(utils.namehash("evmcrispr.eth"));
  });

  it("fails if the value is not an ENS domain", async () => {
    const [interpret, h] = await preparingExpression(
      `@namehash('not an ens domain')`,
      signer,
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
    lazySigner,
  );
});
