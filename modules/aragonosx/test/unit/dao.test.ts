import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  buildPluginInfos,
  parsePluginIdentifier,
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

const RAW_PLUGINS = [
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

describe("AragonOSx > dao", () => {
  it("parses plugin identifiers", () => {
    expect(parsePluginIdentifier("token-voting")).to.eql({
      daoPrefix: undefined,
      subdomain: "token-voting",
      index: 0,
    });
    expect(parsePluginIdentifier("multisig:1")).to.eql({
      daoPrefix: undefined,
      subdomain: "multisig",
      index: 1,
    });
    expect(parsePluginIdentifier("_mydao:multisig:1")).to.eql({
      daoPrefix: "mydao",
      subdomain: "multisig",
      index: 1,
    });
    expect(parsePluginIdentifier("-bad-")).to.equal(undefined);
  });

  it("numbers repeated installs and falls back to addresses", () => {
    const infos = buildPluginInfos(RAW_PLUGINS);
    expect(infos.map((p) => p.identifier)).to.eql([
      "token-voting",
      "multisig",
      "multisig:1",
      "0x9999999999999999999999999999999999999999",
    ]);
  });

  it("resolves plugins by identifier and address", () => {
    const dao: DaoContext = {
      address: DAO_ADDRESS,
      plugins: buildPluginInfos(RAW_PLUGINS),
      nestingIndex: 1,
    };

    expect(resolvePluginInfo(dao, "multisig")?.address).to.equal(
      MULTISIG_PLUGIN,
    );
    expect(resolvePluginInfo(dao, "multisig:1")?.address).to.equal(
      MULTISIG_PLUGIN_2,
    );
    expect(resolvePluginInfo(dao, TOKEN_VOTING_PLUGIN)?.identifier).to.equal(
      "token-voting",
    );
    expect(resolvePluginInfo(dao, "unknown")).to.equal(undefined);
  });
});
