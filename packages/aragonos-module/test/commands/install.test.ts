import type { Action } from '@1hive/evmcrispr';
import { CommandError, addressesEqual } from '@1hive/evmcrispr';
import {
  APP,
  DAO,
  DAO2,
  createInterpreter,
  expectThrowAsync,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import type { AragonOS } from '../../src/AragonOS';
import { encodeActCall } from '../../src/utils';
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  createTestAction,
  findAragonOSCommandNode,
} from '../utils';

describe('AragonOS > commands > install <repo> [initParams]', () => {
  const {
    appId,
    appIdentifier,
    codeAddress,
    initializeParams,
    initializeUnresolvedParams,
    initializeSignature,
  } = APP;
  const newAppIdentifier = `${appIdentifier}:new-app`;

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

  it('should return a correct install action', async () => {
    const interpreter = createAragonScriptInterpreter([
      `install ${newAppIdentifier} ${initializeUnresolvedParams.join(' ')}`,
    ]);

    const installationActions = await interpreter.interpret();

    const expectedInstallationActions: Action[] = [
      createTestAction('newAppInstance', DAO.kernel, [
        appId,
        codeAddress,
        encodeActCall(initializeSignature, initializeParams),
        false,
      ]),
    ];
    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.connectedDAOs[0];
    const installedApp = dao.resolveApp(newAppIdentifier);

    expect(installedApp, 'DAO does not have installed app').to.exist;
    expect(
      addressesEqual(installedApp!.codeAddress, codeAddress),
      'wrong installed app version',
    ).to.be.true;
    expect(installationActions, 'installation actions mismatch').to.eql(
      expectedInstallationActions,
    );
  });

  it('should return a correct install action given a specific version', async () => {
    const specificVersion = '0x714c925ede405687752c4ad32078137c4f179538';
    const interpreter = createAragonScriptInterpreter([
      `install ${newAppIdentifier} ${initializeUnresolvedParams.join(
        ' ',
      )} --version 1.0.1`,
    ]);

    const installationActions = await interpreter.interpret();

    const aragonos = interpreter.getModule('aragonos') as AragonOS;
    const dao = aragonos.getConnectedDAO(DAO.kernel)!;
    const installedApp = dao.resolveApp(newAppIdentifier);

    const expectedInstallationActions = [
      createTestAction('newAppInstance', DAO.kernel, [
        appId,
        specificVersion,
        encodeActCall(initializeSignature, initializeParams),
        false,
      ]),
    ];

    expect(installedApp, ' DAO does not have installed app').to.exist;
    expect(
      addressesEqual(installedApp!.codeAddress, specificVersion),
      'wrong installed app version',
    ).to.be.true;
    expect(installationActions, 'installation actions mismatch').to.eql(
      expectedInstallationActions,
    );
  });

  it('should return a correct install action given a different DAO', async () => {
    const interpreter = createInterpreter(
      `
        load aragonos as ar
        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            install ${newAppIdentifier} ${initializeUnresolvedParams.join(
        ' ',
      )} --dao ${DAO.kernel}
          )
        )
      `,
      signer,
    );

    const installActions = await interpreter.interpret();

    const expectedInstallActions = [
      createTestAction('newAppInstance', DAO.kernel, [
        appId,
        codeAddress,
        encodeActCall(initializeSignature, [
          DAO2.agent,
          ...initializeParams.slice(1, initializeParams.length),
        ]),
        false,
      ]),
    ];

    expect(installActions).to.eql(expectedInstallActions);
  });

  it('should fail when executing it outside a "connect" command', async () => {
    const interpreter = createInterpreter(
      `
    load aragonos as ar

    ar:install ${newAppIdentifier} ${initializeUnresolvedParams.join(' ')}
  `,
      signer,
    );
    const c = interpreter.ast.body[1];
    const error = new CommandError(
      c,
      `must be used within a "connect" command`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail passing an invalid repo identifier', async () => {
    const invalidRepoIdentifier = `missing-label-repo`;
    const interpreter = createAragonScriptInterpreter([
      `install ${invalidRepoIdentifier} ${initializeUnresolvedParams.join(
        ' ',
      )}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'install')!;
    const error = new CommandError(
      c,
      `invalid labeled identifier ${invalidRepoIdentifier}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when passing a repo that can not be resolved', async () => {
    const invalidRepoENSName = `non-existent-repo:new-app`;
    const interpreter = createAragonScriptInterpreter([
      `install ${invalidRepoENSName} ${initializeUnresolvedParams.join(' ')}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'install')!;
    const error = new CommandError(
      c,
      `ENS repo name ${
        invalidRepoENSName.split(':')[0] + '.aragonpm.eth'
      } couldn't be resolved`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when passing an invalid --version option', async () => {
    const invalidVersion = '1e18';
    const interpreter = createAragonScriptInterpreter([
      `install ${newAppIdentifier} ${initializeUnresolvedParams.join(
        ' ',
      )} --version ${invalidVersion}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'install')!;
    const error = new CommandError(
      c,
      `invalid --version option. Expected a semantic version, but got 1000000000000000000`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when installing an app with an identifier previously used', async () => {
    const interpreter = createAragonScriptInterpreter([
      `install ${newAppIdentifier} ${initializeUnresolvedParams.join(' ')}`,
      `install ${newAppIdentifier} ${initializeUnresolvedParams.join(' ')}`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'install', 0, 1)!;
    const error = new CommandError(
      c,
      `identifier ${newAppIdentifier} is already in use.`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });

  it('should fail when passing invalid initialize params', async () => {
    const paramsErrors = [
      '-param _token of type address: invalid address. Got 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a',
      '-param _maxAccountTokens of type uint256: invalid BigNumber value. Got false',
    ];
    const interpreter = createAragonScriptInterpreter([
      `install ${newAppIdentifier} 0x6e00addd18f25f07032818ef4df05b0a6f849af647791821e36448719719ba6a 1e18 false`,
    ]);
    const c = findAragonOSCommandNode(interpreter.ast, 'install')!;

    const error = new CommandError(
      c,
      `error when encoding initialize call:\n${paramsErrors.join('\n')}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
