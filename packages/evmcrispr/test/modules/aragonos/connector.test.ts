import { beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import "../../setup.js";
import { cid } from "is-ipfs";

import type { PublicClient } from "viem";
import { isAddress } from "viem";

import { ErrorException, ErrorNotFound } from "../../../src/errors";
import { Connector } from "../../../src/modules/aragonos/Connector";
import type { ParsedApp } from "../../../src/modules/aragonos/types";
import { parseContentUri } from "../../../src/modules/aragonos/utils";

import { DAO, EOA_ADDRESS } from "../../fixtures";
import { getPublicClient } from "../../test-helpers/client.js";
import { expectThrowAsync } from "../../test-helpers/expects";
import { isValidArtifact, isValidParsedApp } from "./test-helpers/expects";

const CHAIN_ID = 100;

describe("AragonOS > Connector", () => {
  let connector: Connector;
  let client: PublicClient;

  beforeAll(async () => {
    client = getPublicClient();
    connector = new Connector(CHAIN_ID, client);
  });

  it("should fail when creating a connector with an unsupported chain id", async () => {
    await expectThrowAsync(
      () => new Connector(999, client),
      new ErrorException("No subgraph found for chain id 999"),
    );
  });

  describe("repo()", () => {
    it("should find a valid repo", async () => {
      const { codeAddress, contentUri, artifact } = await connector.repo(
        "token-manager",
        "aragonpm.eth",
      );

      expect(isAddress(codeAddress), "Invalid repo code address").to.be.true;
      expect(cid(parseContentUri(contentUri)), "Invalid repo contentUri").to.be
        .true;

      if (artifact) {
        isValidArtifact(artifact);
      }
    });

    it("should fail when fetching a non-existent repo", async () => {
      await expectThrowAsync(
        () => connector.repo("non-existent-repo", "aragonpm.eth"),
        new ErrorNotFound("Repo non-existent-repo.aragonpm.eth not found", {
          name: "ErrorRepoNotFound",
        }),
      );
    });
  });

  describe("organizationApps()", () => {
    let daoApps: ParsedApp[];

    beforeAll(async () => {
      daoApps = await connector.organizationApps(DAO.kernel);
    });

    it("should find the apps", () => {
      expect(daoApps.length).to.be.greaterThan(0);
    });

    it("should return valid parsed apps", () => {
      daoApps.forEach((app) => isValidParsedApp(app));
    });

    it("should fail when fetching the apps of a non-existent dao", async () => {
      await expectThrowAsync(
        () => connector.organizationApps(EOA_ADDRESS),
        new ErrorNotFound("Organization apps not found"),
      );
    });
  });
});
