import { expect } from "chai";
import type { Signer } from "ethers";
import { utils } from "ethers";
import { ethers } from "hardhat";

import type { AragonOS } from "../../../../src/modules/aragonos/AragonOS";
import { getRepoContract } from "../../../../src/modules/aragonos/utils";

import { CommandError } from "../../../../src/errors";
import { DAO } from "../../../fixtures";
import { DAO as DAO2 } from "../../../fixtures/mock-dao-2";
import { DAO as DAO3 } from "../../../fixtures/mock-dao-3";
import { createTestAction } from "../../../test-helpers/actions";
import {
  _aragonEns,
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from "../../../test-helpers/aragonos";
import { createInterpreter } from "../../../test-helpers/cas11";
import { expectThrowAsync } from "../../../test-helpers/expects";

describe("AragonOS > commands > upgrade <apmRepo> [newAppImplementationAddress]", () => {
  let signer: Signer;

  let createAragonScriptInterpreter: ReturnType<
    typeof createAragonScriptInterpreter_
  >;

  before(async () => {
    [signer] = await ethers.getSigners();

    createAragonScriptInterpreter = createAragonScriptInterpreter_(
      signer,
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
    const repo = getRepoContract(repoAddress!, signer);
    const [, latestImplementationAddress] = await repo.getLatest();
    const expectedUpgradeActions = [
      createTestAction("setApp", DAO2.kernel, [
        utils.id("base"),
        utils.namehash("disputable-conviction-voting.open.aragonpm.eth"),
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
    const repo = getRepoContract(repoAddress!, signer);
    const [, newAppImplementation] = await repo.getBySemanticVersion([
      "2",
      "0",
      "0",
    ]);
    const expectedUpgradeActions = [
      createTestAction("setApp", DAO2.kernel, [
        utils.id("base"),
        utils.namehash("disputable-conviction-voting.open.aragonpm.eth"),
        newAppImplementation,
      ]),
    ];

    expect(upgradeActions).to.eql(expectedUpgradeActions);
  });

  it("should return a correct upgrade action given a different DAO", async () => {
    const interpreter = createInterpreter(
      `
        load aragonos as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            connect ${DAO3.kernel} (
              upgrade _${DAO2.kernel}:disputable-conviction-voting.open
            )
          )
        )
      `,
      signer,
    );

    const upgradeActions = await interpreter.interpret();

    const repoAddress = await _aragonEns(
      "disputable-conviction-voting.open.aragonpm.eth",
      interpreter.getModule("aragonos") as AragonOS,
    );
    const repo = getRepoContract(repoAddress!, signer);
    const [, latestImplementationAddress] = await repo.getLatest();
    const expectedUpgradeActions = [
      createTestAction("setApp", DAO2.kernel, [
        utils.id("base"),
        utils.namehash("disputable-conviction-voting.open.aragonpm.eth"),
        latestImplementationAddress,
      ]),
    ];

    expect(upgradeActions).to.eql(expectedUpgradeActions);
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
    load aragonos as ar

    ar:upgrade voting
  `,
      signer,
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
