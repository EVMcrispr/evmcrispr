import { describe, it } from "bun:test";
import type { TransactionAction } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { decodeFunctionData } from "viem";
import admin, { ADMIN_ABI } from "../../src/plugins/admin";
import multisig, { MULTISIG_ABI } from "../../src/plugins/multisig";
import { resolveAdapter } from "../../src/plugins/registry";
import spp, { SPP_ABI } from "../../src/plugins/spp";
import tokenVoting, { TOKEN_VOTING_ABI } from "../../src/plugins/token-voting";
import type { ProposeOpts } from "../../src/plugins/types";
import { ADMIN_PLUGIN, DAO_ADDRESS } from "../fixtures";

const ACTIONS = [
  { to: DAO_ADDRESS, value: 0n, data: "0x12345678" as const },
];

const baseOpts: ProposeOpts = {
  metadata: "0x",
  allowFailureMap: 0n,
  start: 0n,
  end: 0n,
};

describe("AragonOSx > plugins > adapters", () => {
  it("admin encodes an immediate executeProposal", () => {
    const [action] = admin.buildCreateProposal(ADMIN_PLUGIN, ACTIONS, baseOpts) as TransactionAction[];
    const { functionName, args } = decodeFunctionData({
      abi: ADMIN_ABI,
      data: action.data!,
    });
    expect(functionName).to.equal("executeProposal");
    expect(args![1]).to.eql(ACTIONS);
  });

  it("admin rejects voting options", () => {
    expect(() =>
      admin.buildCreateProposal(ADMIN_PLUGIN, ACTIONS, {
        ...baseOpts,
        vote: 2,
      }),
    ).to.throw("no voting");
    expect(() =>
      admin.buildCreateProposal(ADMIN_PLUGIN, ACTIONS, {
        ...baseOpts,
        start: 1n,
      }),
    ).to.throw("immediately");
  });

  it("multisig encodes createProposal with approve/tryExecution flags", () => {
    const [action] = multisig.buildCreateProposal(ADMIN_PLUGIN, ACTIONS, {
      ...baseOpts,
      approve: true,
      tryExecution: true,
      end: 123n,
    }) as TransactionAction[];
    const { functionName, args } = decodeFunctionData({
      abi: MULTISIG_ABI,
      data: action.data!,
    });
    expect(functionName).to.equal("createProposal");
    expect(args).to.eql(["0x", ACTIONS, 0n, true, true, 0n, 123n]);
  });

  it("multisig rejects --vote", () => {
    expect(() =>
      multisig.buildCreateProposal(ADMIN_PLUGIN, ACTIONS, {
        ...baseOpts,
        vote: 2,
      }),
    ).to.throw("--approve");
  });

  it("token-voting encodes createProposal with a creation vote", () => {
    const [action] = tokenVoting.buildCreateProposal(ADMIN_PLUGIN, ACTIONS, {
      ...baseOpts,
      vote: 2,
    }) as TransactionAction[];
    const { args } = decodeFunctionData({
      abi: TOKEN_VOTING_ABI,
      data: action.data!,
    });
    expect(args).to.eql(["0x", ACTIONS, 0n, 0n, 0n, 2, false]);
  });

  it("token-voting encodes vote and execute", () => {
    const [voteAction] = tokenVoting.buildVote!(ADMIN_PLUGIN, 7n, 3, true) as TransactionAction[];
    const decodedVote = decodeFunctionData({
      abi: TOKEN_VOTING_ABI,
      data: voteAction.data!,
    });
    expect(decodedVote.functionName).to.equal("vote");
    expect(decodedVote.args).to.eql([7n, 3, true]);

    const [execAction] = tokenVoting.buildExecute!(ADMIN_PLUGIN, 7n) as TransactionAction[];
    const decodedExec = decodeFunctionData({
      abi: TOKEN_VOTING_ABI,
      data: execAction.data!,
    });
    expect(decodedExec.functionName).to.equal("execute");
  });

  it("spp encodes createProposal with empty stage params", () => {
    const [action] = spp.buildCreateProposal(ADMIN_PLUGIN, ACTIONS, baseOpts) as TransactionAction[];
    const { args } = decodeFunctionData({ abi: SPP_ABI, data: action.data! });
    expect(args).to.eql(["0x", ACTIONS, 0n, 0n, []]);
  });

  it("resolves adapters by repo subdomain", () => {
    expect(
      resolveAdapter({
        address: ADMIN_PLUGIN,
        identifier: "admin",
        repoSubdomain: "admin",
        helpers: [],
      }).id,
    ).to.equal("admin");
    expect(() =>
      resolveAdapter({
        address: ADMIN_PLUGIN,
        identifier: ADMIN_PLUGIN.toLowerCase(),
        helpers: [],
      }),
    ).to.throw("no governance adapter");
  });
});
