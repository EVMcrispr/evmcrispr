import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";
import type { PublicClient } from "viem";

import { NodeType } from "../../../../src/types/index.js";
import { ComparisonType } from "../../../../src/utils/index.js";
import { getPublicClient } from "../../../test-helpers/client.js";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/evml.js";

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
