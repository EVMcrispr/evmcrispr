import "../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  organizationApps,
  subgraphUrlFromChainId,
} from "@evmcrispr/module-aragonos/subgraph";
import type { ParsedApp } from "@evmcrispr/module-aragonos/types";

import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import { expect, getPublicClient } from "@evmcrispr/test-utils";
import { expectThrowAsync } from "@evmcrispr/test-utils/evml";
import type { PublicClient } from "viem";
import { EOA_ADDRESS } from "../fixtures";
import { DAO } from "../fixtures/mock-dao";
import { isValidParsedApp } from "../test-helpers/expects";

describe("AragonOS > subgraph", () => {
  let client: PublicClient;

  beforeAll(async () => {
    client = getPublicClient();
  });

  it("should fail when resolving an unsupported chain id", async () => {
    await expectThrowAsync(
      () => subgraphUrlFromChainId(999),
      new ErrorException("No subgraph found for chain id 999"),
    );
  });

  describe("organizationApps()", () => {
    let daoApps: ParsedApp[];

    beforeAll(async () => {
      daoApps = await organizationApps(client, DAO.kernel);
    });

    it("should find the apps", () => {
      expect(daoApps.length).to.be.greaterThan(0);
    });

    it("should return valid parsed apps", () => {
      daoApps.forEach((app) => isValidParsedApp(app));
    });

    it("should fail when fetching the apps of a non-existent dao", async () => {
      await expectThrowAsync(
        () => organizationApps(client, EOA_ADDRESS),
        new ErrorNotFound("Organization apps not found"),
      );
    });
  });
});
