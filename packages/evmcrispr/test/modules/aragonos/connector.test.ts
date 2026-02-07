import { expect } from "chai";
import hre, { viem } from "hardhat";
import { cid } from "is-ipfs";

import type { PublicClient } from "viem";
import { isAddress } from "viem";

import { ErrorException, ErrorNotFound } from "../../../src/errors";
import { Connector } from "../../../src/modules/aragonos/Connector";
import type { ParsedApp } from "../../../src/modules/aragonos/types";
import { parseContentUri } from "../../../src/modules/aragonos/utils";

import { DAO, EOA_ADDRESS } from "../../fixtures";
import { expectThrowAsync } from "../../test-helpers/expects";
import { isValidArtifact, isValidParsedApp } from "./test-helpers/expects";

const {
  network: {
    config: { chainId },
  },
} = hre;

const GOERLI_DAO_ADDRESS = "0xd8765273da3a7f7a4dc184e8a9f8a894e4dfb4c4";

describe("AragonOS > Connector", () => {
  let connector: Connector;
  let goerliConnector: Connector;
  let client: PublicClient;

  before(async () => {
    client = await viem.getPublicClient();

    connector = new Connector(chainId || 4, client);
    goerliConnector = new Connector(5, client);
  });

  it("should fail when creating a connector with an unknown chain id", () => {
    expectThrowAsync(() => new Connector(999, client), new ErrorException());
  });

  describe("repo()", () => {
    it("should find a valid repo", async () => {
      const { codeAddress, contentUri, artifact } = await connector.repo(
        "token-manager",
        "aragonpm.eth",
      );

      expect(isAddress(codeAddress), "Invalid  repo code address").to.be.true;

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
    let goerliDaoApps: ParsedApp[];

    before(async () => {
      daoApps = await connector.organizationApps(DAO.kernel);
      goerliDaoApps =
        await goerliConnector.organizationApps(GOERLI_DAO_ADDRESS);
    });

    describe("when fetching apps from a non-goerli's dao", () => {
      it("should find the apps", () => {
        expect(daoApps.length).to.be.greaterThan(0);
      });

      it("should return valid parsed apps", () => {
        daoApps.forEach((app) => isValidParsedApp(app));
      });
    });

    describe("when fetching apps from a goerli's dao", () => {
      it("should find the apps", () => {
        expect(goerliDaoApps.length).to.be.greaterThan(0);
      });

      it("shole return valid parsed apps", () => {
        goerliDaoApps.forEach((app) => isValidParsedApp(app));
      });
    });

    it("should fail when fetching the apps of a non-existent dao", async () => {
      await expectThrowAsync(
        () => connector.organizationApps(EOA_ADDRESS),
        new ErrorNotFound("Organization apps not found"),
      );
    });
  });
});
