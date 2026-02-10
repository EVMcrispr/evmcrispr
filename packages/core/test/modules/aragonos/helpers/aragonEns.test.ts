import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../../setup.js";

import { ComparisonType, NodeType } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getPublicClient } from "../../../test-helpers/client.js";
import {
  itChecksInvalidArgsLength,
  preparingExpression,
} from "../../../test-helpers/evml.js";

describe("AragonOS > helpers > @aragonEns()", () => {
  let client: PublicClient;
  const lazyClient = () => client;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("should interpret it correctly", async () => {
    const [repoRes] = await preparingExpression(
      "@aragonEns(hooked-token-manager-no-controller.open.aragonpm.eth)",
      client,
      "aragonos",
    );
    const [daoRes] = await preparingExpression(
      `@aragonEns(test.aragonid.eth)`,
      client,
      "aragonos",
    );

    expect(await repoRes(), "Repo address mismatch").to.equals(
      "0x7762A148DeA89C5099c0B14c260a2e24bB3AD264",
    );
    expect(await daoRes(), "DAO address mismatch").to.equals(
      `0x380498cF5C188BAD479EFbc0Ea1eC40d49D5C58d`,
    );
  });

  itChecksInvalidArgsLength(
    NodeType.HelperFunctionExpression,
    "@aragonEns",
    ["mydao.aragonid.eth", "0x98Df287B6C145399Aaa709692c8D308357bC085D"],
    { type: ComparisonType.Between, minValue: 1, maxValue: 2 },
    lazyClient,
    "aragonos",
  );
});
