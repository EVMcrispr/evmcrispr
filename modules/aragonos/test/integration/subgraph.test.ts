import "../setup";
import { beforeAll, describe, it } from "bun:test";
import {
  organizationApps,
  repo,
  subgraphUrlFromChainId,
} from "@evmcrispr/module-aragonos/subgraph";
import type { ParsedApp } from "@evmcrispr/module-aragonos/types";

import { ErrorException, ErrorNotFound } from "@evmcrispr/sdk";
import {
  expect,
  expectThrowAsync,
  getPublicClient,
} from "@evmcrispr/test-utils";
import { cid } from "is-ipfs";
import type { PublicClient } from "viem";
import { isAddress } from "viem";
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

  describe("repo()", () => {
    it("should find a valid repo", async () => {
      const { codeAddress, contentUri } = await repo(
        client,
        "token-manager",
        "aragonpm.eth",
      );

      expect(isAddress(codeAddress), "Invalid repo code address").to.be.true;
      expect(cid(contentUri.split(":").pop()!), "Invalid repo contentUri").to.be
        .true;
    });

    it("should fail when fetching a non-existent repo", async () => {
      await expectThrowAsync(
        () => repo(client, "non-existent-repo", "aragonpm.eth"),
        new ErrorNotFound("Repo non-existent-repo.aragonpm.eth not found", {
          name: "ErrorRepoNotFound",
        }),
      );
    });
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
