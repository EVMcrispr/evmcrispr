import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import type { AragonOS } from '../../../../src/cas11/modules/aragonos/AragonOS';
import { getRepoContract } from '../../../../src/cas11/modules/aragonos/utils';

import { CommandError } from '../../../../src/errors';
import { DAO } from '../../../fixtures';
import { DAO as DAO2 } from '../../../fixtures/mock-dao-2';
import { DAO as DAO3 } from '../../../fixtures/mock-dao-3';
import { createTestAction } from '../../../test-helpers/actions';
import {
  _aragonEns,
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
} from '../../../test-helpers/aragonos';
import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const upgradeDescribe = (): Suite =>
  describe('upgrade <apmRepo> [newAppImplementationAddress]', () => {
    let signer: Signer;

    let createAragonScriptInterpreter: ReturnType<
      typeof createAragonScriptInterpreter_
    >;

    before(async () => {
      [signer] = await ethers.getSigners();

      createAragonScriptInterpreter = createAragonScriptInterpreter_(
        signer,
        DAO.kernel,
      );
    });

    it("should return a correct upgrade action to the latest app's version", async () => {
      const interpreter = createAragonScriptInterpreter([`upgrade voting`]);

      const upgradeActions = await interpreter.interpret();

      const repoAddress = await _aragonEns(
        'voting.aragonpm.eth',
        interpreter.getModule('aragonos') as AragonOS,
      );
      const repo = getRepoContract(repoAddress!, signer);
      const [, latestImplementationAddress] = await repo.getLatest();
      const expectedUpgradeActions = [
        createTestAction('setApp', DAO.kernel, [
          utils.id('base'),
          utils.namehash('voting.aragonpm.eth'),
          latestImplementationAddress,
        ]),
      ];

      expect(upgradeActions).to.eql(expectedUpgradeActions);
    });

    it('should return a correct upgrade action given a specific version', async () => {
      const interpreter = createAragonScriptInterpreter([
        `upgrade voting 3.0.3`,
      ]);

      const upgradeActions = await interpreter.interpret();

      const repoAddress = await _aragonEns(
        'voting.aragonpm.eth',
        interpreter.getModule('aragonos') as AragonOS,
      );
      const repo = getRepoContract(repoAddress!, signer);
      const [, newAppImplementation] = await repo.getBySemanticVersion([
        '3',
        '0',
        '3',
      ]);
      const expectedUpgradeActions = [
        createTestAction('setApp', DAO.kernel, [
          utils.id('base'),
          utils.namehash('voting.aragonpm.eth'),
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
              upgrade _2:voting
            )
          )
        )
      `,
        signer,
      );

      const upgradeActions = await interpreter.interpret();

      const repoAddress = await _aragonEns(
        'voting.aragonpm.eth',
        interpreter.getModule('aragonos') as AragonOS,
      );
      const repo = getRepoContract(repoAddress!, signer);
      const [, latestImplementationAddress] = await repo.getLatest();
      const expectedUpgradeActions = [
        createTestAction('setApp', DAO2.kernel, [
          utils.id('base'),
          utils.namehash('voting.aragonpm.eth'),
          latestImplementationAddress,
        ]),
      ];

      expect(upgradeActions).to.eql(expectedUpgradeActions);
    });

    it('should fail when executing it outside a "connect" command', async () => {
      const error = new CommandError(
        'upgrade',
        'must be used within a "connect" command',
      );
      await expectThrowAsync(
        () =>
          createInterpreter(
            `
        load aragonos as ar

        ar:upgrade voting
      `,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when upgrading a non-existent app', async () => {
      const apmRepo = 'superfluid.open';
      const error = new CommandError(
        'upgrade',
        `${apmRepo}.aragonpm.eth not installed on current DAO.`,
      );

      await expectThrowAsync(
        () => createAragonScriptInterpreter([`upgrade ${apmRepo}`]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when providing an invalid second parameter', async () => {
      const error = new CommandError(
        'upgrade',
        'second upgrade parameter must be a semantic version, an address, or nothing',
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter(['upgrade voting 1e18']).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when upgrading an app to the same version', async () => {
      const error = new CommandError(
        'upgrade',
        `trying to upgrade app to its current version`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter(['upgrade voting 2.3.0']).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
