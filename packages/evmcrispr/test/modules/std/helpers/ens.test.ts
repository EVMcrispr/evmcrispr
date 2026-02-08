import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";

import type { PublicClient } from "viem";
import { HelperFunctionError } from "../../../../src/errors";
import { NodeType } from "../../../../src/types";
import { ComparisonType } from "../../../../src/utils";
import { getPublicClient } from "../../../test-helpers/client.js";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/evml";
import { expectThrowAsync } from "../../../test-helpers/expects";

describe("Std > helpers > @ens(name)", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("return the hashed value", async () => {
    const [interpret] = await preparingExpression(
      `@ens('vitalik.eth')`,
      client,
    );

    expect(await interpret()).to.equals(
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
  });

  it("should fail when ENS name not found", async () => {
    const [interpret, h] = await preparingExpression(
      `@ens('_notfound.eth')`,
      client,
    );
    const error = new HelperFunctionError(
      h,
      "ENS name _notfound.eth not found",
    );

    await expectThrowAsync(async () => interpret(), error);
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@ens",
    ["exampleValue"],
    {
      type: ComparisonType.Equal,
      minValue: 1,
    },
    lazyClient,
  );
});
