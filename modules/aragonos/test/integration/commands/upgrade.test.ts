import "../../setup";

import type AragonOS from "@evmcrispr/module-aragonos";
import { REPO_ABI } from "@evmcrispr/module-aragonos/utils";
import { CommandError } from "@evmcrispr/sdk";
import {
  describeCommand,
  expect,
  getPublicClient,
} from "@evmcrispr/test-utils";
import { getContract, keccak256, namehash, toHex } from "viem";
import { DAO, DAO2, DAO3 } from "../../fixtures";
import { createTestAction } from "../../test-helpers/actions";
import {
  _aragonEns,
  findAragonOSCommandNode,
} from "../../test-helpers/aragonos";

const preamble = `load aragonos --as ar\nar:connect ${DAO2.kernel} (`;

describeCommand("upgrade", {
  describeName:
    "AragonOS > commands > upgrade <apmRepo> [newAppImplementationAddress]",
  module: "aragonos",
  preamble,
  cases: [
    {
      name: "should return a correct upgrade action to the latest app's version",
      script: `upgrade disputable-conviction-voting.open\n)`,
      validate: async (upgradeActions, interpreter) => {
        const client = getPublicClient();
        const repoAddress = await _aragonEns(
          "disputable-conviction-voting.open.aragonpm.eth",
          interpreter.getModule("aragonos") as AragonOS,
        );
        const repo = getContract({
          address: repoAddress!,
          abi: REPO_ABI,
          client,
        });
        const [, latestImplementationAddress] = await repo.read.getLatest();
        const expectedUpgradeActions = [
          createTestAction("setApp", DAO2.kernel, [
            keccak256(toHex("base")),
            namehash("disputable-conviction-voting.open.aragonpm.eth"),
            latestImplementationAddress,
          ]),
        ];
        expect(upgradeActions).to.eql(expectedUpgradeActions);
      },
    },
    {
      name: "should return a correct upgrade action given a specific version",
      script: `upgrade disputable-conviction-voting.open 2.0.0\n)`,
      validate: async (upgradeActions, interpreter) => {
        const client = getPublicClient();
        const repoAddress = await _aragonEns(
          "disputable-conviction-voting.open.aragonpm.eth",
          interpreter.getModule("aragonos") as AragonOS,
        );
        const repo = getContract({
          address: repoAddress!,
          abi: REPO_ABI,
          client,
        });
        const [, newAppImplementation] = await repo.read.getBySemanticVersion([
          [2, 0, 0],
        ] as [readonly [number, number, number]]);
        const expectedUpgradeActions = [
          createTestAction("setApp", DAO2.kernel, [
            keccak256(toHex("base")),
            namehash("disputable-conviction-voting.open.aragonpm.eth"),
            newAppImplementation,
          ]),
        ];
        expect(upgradeActions).to.eql(expectedUpgradeActions);
      },
    },
  ],
  errorCases: [
    {
      name: "should fail when upgrading a non-existent app",
      script: `upgrade transactions.open\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "upgrade")!;
        return new CommandError(
          c,
          `transactions.open.aragonpm.eth not installed on current DAO.`,
        );
      },
    },
    {
      name: "should fail when providing an invalid second parameter",
      script: `upgrade disputable-conviction-voting.open 1e18\n)`,
      error: (interpreter) => {
        const c = findAragonOSCommandNode(interpreter.ast, "upgrade")!;
        return new CommandError(
          c,
          "second upgrade parameter must be a semantic version, an address, or nothing",
        );
      },
    },
  ],
});

describeCommand("upgrade", {
  describeName: "AragonOS > commands > upgrade > special cases",
  module: "aragonos",
  cases: [
    {
      name: "should return a correct upgrade action given a different DAO",
      script: `load aragonos --as ar\nar:connect ${DAO.kernel} (\n  connect ${DAO2.kernel} (\n    connect ${DAO3.kernel} (\n      upgrade _${DAO2.kernel}:disputable-conviction-voting.open\n    )\n  )\n)`,
      validate: async (upgradeActions, interpreter) => {
        const client = getPublicClient();
        const repoAddress = await _aragonEns(
          "disputable-conviction-voting.open.aragonpm.eth",
          interpreter.getModule("aragonos") as AragonOS,
        );
        const repo = getContract({ address: repoAddress!, abi: REPO_ABI, client });
        const [, latestImplementationAddress] = await repo.read.getLatest();
        const expectedUpgradeActions = [
          createTestAction("setApp", DAO2.kernel, [
            keccak256(toHex("base")),
            namehash("disputable-conviction-voting.open.aragonpm.eth"),
            latestImplementationAddress,
          ]),
        ];
        expect(upgradeActions).to.eql(expectedUpgradeActions);
      },
    },
  ],
  errorCases: [
    {
      name: 'should fail when executing it outside a "connect" command',
      script: `load aragonos --as ar\nar:upgrade voting`,
      error: (interpreter) => {
        const c = interpreter.ast.body[1];
        return new CommandError(c, 'must be used within a "connect" command');
      },
    },
  ],
});
