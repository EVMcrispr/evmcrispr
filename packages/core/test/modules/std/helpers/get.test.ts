import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";

import { ComparisonType, HelperFunctionError, NodeType } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getPublicClient } from "../../../test-helpers/client.js";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/evml.js";
import { expectThrowAsync } from "../../../test-helpers/expects.js";

describe("Std > helpers > @get(contractAddress, method, params?)", () => {
  let client: PublicClient;
  const clientSigner = () => client;
  const targetAddress = "0x44fA8E6f47987339850636F88629646662444217";

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("should interpret it correctly", async () => {
    const [interpret] = await preparingExpression(
      `@get(${targetAddress}, name():(string))`,
      client,
    );

    expect(await interpret()).to.eq("Dai Stablecoin on xDai");
  });

  it("should interpret it correctly", async () => {
    const sushiFarm = "0xdDCbf776dF3dE60163066A5ddDF2277cB445E0F3";
    const [interpret] = await preparingExpression(
      `@get(${sushiFarm},"poolInfo(uint256):(uint128,uint64,uint64):1",1)`,
      client,
    );

    expect((await interpret()) >= 1671364630n).to.be.true;
  });

  it("should interpret it correctly", async () => {
    const [interpret] = await preparingExpression(
      `@get(${targetAddress}, balanceOf(address):(uint), ${targetAddress})`,
      client,
    );

    expect(await interpret()).not.to.be.eq("0");
  });

  it("should fail if the method is not a valid function signature", async () => {
    const [interpret, h] = await preparingExpression(
      `@get(${targetAddress}, not_a_valid_function_signature)`,
      client,
    );

    const error = new HelperFunctionError(
      h,
      `expected a valid function signature, but got "not_a_valid_function_signature"`,
    );

    await expectThrowAsync(async () => interpret(), error);
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@get",
    [targetAddress, "name():(string)"],
    {
      type: ComparisonType.Greater,
      minValue: 2,
    },
    clientSigner,
  );
});
