import "../../setup";
import { beforeAll, describe, it } from "bun:test";

import type AragonOS from "@evmcrispr/module-aragonos";
import { REPO_ABI } from "@evmcrispr/module-aragonos/utils";
import { CommandError } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import { getContract, keccak256, namehash, toHex } from "viem";
import { DAO, DAO2, DAO3 } from "../../fixtures";
import {
  expect,
  expectThrowAsync,
  getPublicClient,
} from "@evmcrispr/test-utils";
import { createInterpreter } from "../../test-helpers/evml";
import { createTestAction } from "../../test-helpers/actions";
import {
  _aragonEns,
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from "../../test-helpers/aragonos";

describe("AragonOS > commands > upgrade <apmRepo> [newAppImplementationAddress]", () => {
  let client: PublicClient;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  beforeAll(async () => {
    client = getPublicClient();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      client,
      DAO2.kernel,
    );
  });

  it("should return a correct upgrade action to the latest app's version", async () => {
    const interpreter = createAragonScriptInterpreter([
      `upgrade disputable-conviction-voting.open`,
    ]);

    const upgradeActions = await interpreter.interpret();

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
  });

  it("should return a correct upgrade action given a specific version", async () => {
    const interpreter = createAragonScriptInterpreter([
      `upgrade disputable-conviction-voting.open 2.0.0`,
    ]);

    const upgradeActions = await interpreter.interpret();

    const repoAddress = await _aragonEns(
      "disputable-conviction-voting.open.aragonpm.eth",
      interpreter.getModule("aragonos") as AragonOS,
    );
    const repo = getContract({ address: repoAddress!, abi: REPO_ABI, client });
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
  });

  it("should return a correct upgrade action given a different DAO", async () => {
    const interpreter = createInterpreter(
      `
        load aragonos --as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            connect ${DAO3.kernel} (
              upgrade _${DAO2.kernel}:disputable-conviction-voting.open
            )
          )
        )
      `,
      client,
    );

    const upgradeActions = await interpreter.interpret();

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
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
    load aragonos --as ar

    ar:upgrade voting
  `,
      client,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      'must be used within a "connect" command',
    );
    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when upgrading a non-existent app", async () => {
    const apmRepo = "transactions.open";
    const interpreter = createAragonScriptInterpreter([`upgrade ${apmRepo}`]);
    const c = findAragonOSCommandNode(interpreter.ast, "upgrade")!;
    const error = new CommandError(
      c,
      `${apmRepo}.aragonpm.eth not installed on current DAO.`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it("should fail when providing an invalid second parameter", async () => {
    const interpreter = createAragonScriptInterpreter([
      "upgrade disputable-conviction-voting.open 1e18",
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, "upgrade")!;

    const error = new CommandError(
      c,
      "second upgrade parameter must be a semantic version, an address, or nothing",
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
