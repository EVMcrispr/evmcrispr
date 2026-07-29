import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  countPlugins,
  isPluginSubdomain,
  pluginDisplayName,
  resolvePluginInfo,
} from "../../src/dao";
import type { DaoContext } from "../../src/types";
import {
  DAO_ADDRESS,
  MULTISIG_PLUGIN,
  MULTISIG_PLUGIN_2,
  MULTISIG_REPO,
  TOKEN_VOTING_PLUGIN,
  TOKEN_VOTING_REPO,
} from "../fixtures";

const PLUGINS = [
  {
    address: TOKEN_VOTING_PLUGIN,
    repoSubdomain: "token-voting",
    repoAddress: TOKEN_VOTING_REPO,
    helpers: [],
  },
  {
    address: MULTISIG_PLUGIN,
    repoSubdomain: "multisig",
    repoAddress: MULTISIG_REPO,
    helpers: [],
  },
  {
    address: MULTISIG_PLUGIN_2,
    repoSubdomain: "multisig",
    repoAddress: MULTISIG_REPO,
    helpers: [],
  },
  {
    address: "0x9999999999999999999999999999999999999999" as const,
    helpers: [],
  },
];

const DAO: DaoContext = {
  address: DAO_ADDRESS,
  plugins: PLUGINS,
};

describe("AragonOSx > dao", () => {
  it("recognizes plugin subdomains", () => {
    expect(isPluginSubdomain("token-voting")).to.be.true;
    expect(isPluginSubdomain("multisig")).to.be.true;
    expect(isPluginSubdomain("multisig:1")).to.be.false;
    expect(isPluginSubdomain("_mydao:multisig")).to.be.false;
    expect(isPluginSubdomain("-bad-")).to.be.false;
  });

  it("derives display names from subdomains, falling back to addresses", () => {
    expect(DAO.plugins.map(pluginDisplayName)).to.eql([
      "token-voting",
      "multisig",
      "multisig",
      "0x9999999999999999999999999999999999999999",
    ]);
  });

  it("counts plugins per subdomain", () => {
    expect(countPlugins(DAO, "multisig")).to.equal(2);
    expect(countPlugins(DAO, "token-voting")).to.equal(1);
    expect(countPlugins(DAO, "unknown")).to.equal(0);
  });

  it("resolves plugins by subdomain, index, and address", () => {
    expect(resolvePluginInfo(DAO, "multisig")?.address).to.equal(
      MULTISIG_PLUGIN,
    );
    expect(resolvePluginInfo(DAO, "multisig", 1)?.address).to.equal(
      MULTISIG_PLUGIN_2,
    );
    expect(resolvePluginInfo(DAO, "multisig", 2)).to.equal(undefined);
    expect(resolvePluginInfo(DAO, TOKEN_VOTING_PLUGIN)?.repoSubdomain).to.equal(
      "token-voting",
    );
    expect(resolvePluginInfo(DAO, "unknown")).to.equal(undefined);
  });
});
