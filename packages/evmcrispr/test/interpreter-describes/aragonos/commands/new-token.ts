import { expect } from 'chai';
import type { Signer } from 'ethers';
import { constants } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { MINIME_TOKEN_FACTORIES } from '../../../../src/cas11/modules/aragonos/utils';
import { CommandError } from '../../../../src/errors';
import {
  buildNonceForAddress,
  calculateNewProxyAddress,
} from '../../../../src/utils';
import { DAO } from '../../../fixtures';
import { DAO as DAO2 } from '../../../fixtures/mock-dao-2';
import { createTestAction } from '../../../test-helpers/actions';
import {
  createAragonScriptInterpreter as createAragonScriptInterpreter_,
  findAragonOSCommandNode,
} from '../../../test-helpers/aragonos';
import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const newTokenDescribe = (): Suite =>
  describe('new-token <name> <symbol> <controller> [decimals = 18] [transferable = true]', () => {
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

    it('should return a correct new token action', async () => {
      const params = [
        'my-token',
        'MT',
        'token-manager.open:counter-factual-tm',
      ];

      const interpreter = await createAragonScriptInterpreter([
        `new-token ${params.join(' ')}`,
      ]);

      const newTokenActions = await interpreter.interpret();

      const tokenFactoryAddress = MINIME_TOKEN_FACTORIES.get(
        await signer.getChainId(),
      )!;

      const newTokenAddress = calculateNewProxyAddress(
        tokenFactoryAddress,
        await buildNonceForAddress(tokenFactoryAddress, 0, signer.provider!),
      );

      const expectedNewTokenActions = [
        createTestAction(
          'createCloneToken',
          MINIME_TOKEN_FACTORIES.get(await signer.getChainId())!,
          [constants.AddressZero, 0, params[0], 18, params[1], true],
        ),
        createTestAction('changeController', newTokenAddress, [
          calculateNewProxyAddress(
            DAO.kernel,
            await buildNonceForAddress(DAO.kernel, 0, signer.provider!),
          ),
        ]),
      ];

      expect(newTokenActions).to.eql(expectedNewTokenActions);
    });

    it('should return a correct new token action given a different DAO', async () => {
      const params = [
        'my-token',
        'MT',
        'token-manager.open:counter-factual-tm',
      ];

      const intepreter = createInterpreter(
        `
        load aragonos as ar

        ar:connect ${DAO.kernel} (
          connect ${DAO2.kernel} (
            new-token ${params.join(' ')} --dao ${DAO2.kernel}
          )
        )
      `,
        signer,
      );

      const newTokenActions = await intepreter.interpret();

      const tokenFactoryAddress = MINIME_TOKEN_FACTORIES.get(
        await signer.getChainId(),
      )!;

      const newTokenAddress = calculateNewProxyAddress(
        tokenFactoryAddress,
        await buildNonceForAddress(tokenFactoryAddress, 0, signer.provider!),
      );

      const expectedNewTokenActions = [
        createTestAction(
          'createCloneToken',
          MINIME_TOKEN_FACTORIES.get(await signer.getChainId())!,
          [constants.AddressZero, 0, params[0], 18, params[1], true],
        ),
        createTestAction('changeController', newTokenAddress, [
          calculateNewProxyAddress(
            DAO2.kernel,
            await buildNonceForAddress(DAO2.kernel, 0, signer.provider!),
          ),
        ]),
      ];

      expect(newTokenActions).to.eql(expectedNewTokenActions);
    });

    it('should fail when executing it outside a "connect" command', async () => {
      const interpreter = createInterpreter(
        `
      load aragonos as ar

      ar:new-token "a new token" ANT token-manager.open:counter-factual-tm
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

    it('should fail when passing an invalid token decimals value', async () => {
      const invalidDecimals = 'invalidDecimals';
      const interpreter = createAragonScriptInterpreter([
        `new-token "a new token" ANT token-manager.open:counter-factual-tm ${invalidDecimals}`,
      ]);
      const c = findAragonOSCommandNode(interpreter.ast, 'new-token')!;
      const error = new CommandError(
        c,
        `invalid decimals. Expected an integer number, but got ${invalidDecimals}`,
      );

      await expectThrowAsync(() => interpreter.interpret(), error);
    });

    it('should fail when passing an invalid controller', async () => {
      const invalidController = 'asd:123-asd&45';
      const interpreter = createAragonScriptInterpreter([
        `new-token "a new token" ANT ${invalidController}`,
      ]);
      const c = findAragonOSCommandNode(interpreter.ast, 'new-token')!;
      const error = new CommandError(
        c,
        `invalid controller. Expected an address or an app identifier, but got ${invalidController}`,
      );

      await expectThrowAsync(() => interpreter.interpret(), error);
    });

    it('should fail when passing an invalid transferable flag', async () => {
      const invalidTransferable = 'an-invalid-value';
      const interpreter = createAragonScriptInterpreter([
        `new-token "a new token" ANT token-manager.open:counter-factual-tm 18 ${invalidTransferable}`,
      ]);
      const c = findAragonOSCommandNode(interpreter.ast, 'new-token')!;
      const error = new CommandError(
        c,
        `invalid transferable flag. Expected a boolean, but got ${invalidTransferable}`,
      );

      await expectThrowAsync(() => interpreter.interpret(), error);
    });
  });
