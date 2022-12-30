import { CommandError } from '@1hive/evmcrispr';
import {
  DAO,
  DAO2,
  DAO3,
  createInterpreter,
  expectThrowAsync,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';

import type { AragonOS } from '../../src/AragonOS';
import { getRepoContract } from '../../src/utils';
import {
  _aragonEns,
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  createTestAction,
  findAragonOSCommandNode,
} from '../utils';

describe('AragonOS > commands > upgrade <apmRepo> [newAppImplementationAddress]', () => {
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
      'disputable-conviction-voting.open.aragonpm.eth',
      interpreter.getModule('aragonos') as AragonOS,
    );
    const repo = getRepoContract(repoAddress!, signer);
    const [, latestImplementationAddress] = await repo.getLatest();
    const expectedUpgradeActions = [
      createTestAction('setApp', DAO2.kernel, [
        utils.id('base'),
        utils.namehash('disputable-conviction-voting.open.aragonpm.eth'),
        latestImplementationAddress,
      ]),
    ];

    expect(upgradeActions).to.eql(expectedUpgradeActions);
  });

  it('should return a correct upgrade action given a specific version', async () => {
    const interpreter = createAragonScriptInterpreter([
      `upgrade disputable-conviction-voting.open 2.0.0`,
    ]);

    const upgradeActions = await interpreter.interpret();

    const repoAddress = await _aragonEns(
      'disputable-conviction-voting.open.aragonpm.eth',
      interpreter.getModule('aragonos') as AragonOS,
    );
    const repo = getRepoContract(repoAddress!, signer);
    const [, newAppImplementation] = await repo.getBySemanticVersion([
      '2',
      '0',
      '0',
    ]);
    const expectedUpgradeActions = [
      createTestAction('setApp', DAO2.kernel, [
        utils.id('base'),
        utils.namehash('disputable-conviction-voting.open.aragonpm.eth'),
        newAppImplementation,
      ]),
    ];

    expect(upgradeActions).to.eql(expectedUpgradeActions);
  });

  it('should return a correct upgrade action given a different DAO', async () => {
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
      'disputable-conviction-voting.open.aragonpm.eth',
      interpreter.getModule('aragonos') as AragonOS,
    );
    const repo = getRepoContract(repoAddress!, signer);
    const [, latestImplementationAddress] = await repo.getLatest();
    const expectedUpgradeActions = [
      createTestAction('setApp', DAO2.kernel, [
        utils.id('base'),
        utils.namehash('disputable-conviction-voting.open.aragonpm.eth'),
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

  it('should fail when upgrading a non-existent app', async () => {
    const apmRepo = 'superfluid.open';
    const interpreter = createAragonScriptInterpreter([`upgrade ${apmRepo}`]);
    const c = findAragonOSCommandNode(interpreter.ast, 'upgrade')!;
    const error = new CommandError(
      c,
      `${apmRepo}.aragonpm.eth not installed on current DAO.`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when providing an invalid second parameter', async () => {
    const interpreter = createAragonScriptInterpreter([
      'upgrade disputable-conviction-voting.open 1e18',
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'upgrade')!;

    const error = new CommandError(
      c,
      'second upgrade parameter must be a semantic version, an address, or nothing',
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when upgrading an app to the same version', async () => {
    const interpreter = createAragonScriptInterpreter([
      'upgrade disputable-conviction-voting.open 1.0.0',
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'upgrade')!;
    const error = new CommandError(
      c,
      `trying to upgrade app to its current version`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
