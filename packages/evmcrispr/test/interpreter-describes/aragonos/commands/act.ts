import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { CommandError } from '../../../../src/errors';
import { DAO } from '../../../fixtures';
import { createTestScriptEncodedAction } from '../../../test-helpers/actions';
import { createAragonScriptInterpreter as _createAragonScriptInterpreter } from '../../../test-helpers/aragonos';
import { itChecksNonDefinedIdentifier } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const actDescribe = (): Suite =>
  describe('act <agent> <targetAddress> <methodSignature> [...params]', () => {
    let signer: Signer;

    let createAragonScriptInterpreter: ReturnType<
      typeof _createAragonScriptInterpreter
    >;

    before(async () => {
      [signer] = await ethers.getSigners();

      createAragonScriptInterpreter = _createAragonScriptInterpreter(
        signer,
        DAO.kernel,
      );
    });

    it('should return a correct act action', async () => {
      const interpreter = createAragonScriptInterpreter([
        `act agent vault "deposit(uint256,uint256[][])" 1 [[2,3],[4,5]]`,
      ]);

      const actActions = await interpreter.interpret();

      const fnABI = new utils.Interface([
        'function deposit(uint256,uint256[][])',
      ]);

      const expectedActActions = [
        createTestScriptEncodedAction(
          [
            {
              to: DAO.vault,
              data: fnABI.encodeFunctionData('deposit', [
                1,
                [
                  [2, 3],
                  [4, 5],
                ],
              ]),
            },
          ],
          ['agent'],
        ),
      ];

      expect(actActions).to.be.eql(expectedActActions);
    });

    itChecksNonDefinedIdentifier(
      'should fail when receiving a non-defined agent identifier',
      (nonDefinedIdentifier) =>
        createAragonScriptInterpreter([
          `act ${nonDefinedIdentifier} vault "deposit()"`,
        ]),
    );

    itChecksNonDefinedIdentifier(
      'should fail when receiving a non-defined target identifier',
      (nonDefinedIdentifier) =>
        createAragonScriptInterpreter([
          `act agent ${nonDefinedIdentifier} "deposit()"`,
        ]),
    );

    it('should fail when receiving an invalid agent address', async () => {
      const invalidAgentAddress = 'false';
      const error = new CommandError(
        'act',
        `expected a valid agent address, but got ${invalidAgentAddress}`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `act ${invalidAgentAddress} vault "deposit()"`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when receiving an invalid target address', async () => {
      const invalidTargetAddress = '2e18';
      const error = new CommandError(
        'act',
        `expected a valid target address, but got 2000000000000000000`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `act agent:0 ${invalidTargetAddress} "deposit()"`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when receiving an invalid signature', async () => {
      const cases = [
        ['mint', 'no parenthesis'],
        ['mint(', 'left parenthesis'],
        ['mint)', 'right parenthesis'],
        ['mint(uint,)', 'right comma'],
        ['mint(,uint)', 'left comma'],
      ];

      await Promise.all(
        cases.map(([invalidSignature, msg]) => {
          const error = new CommandError(
            'act',
            `expected a valid signature, but got ${invalidSignature}`,
          );

          return expectThrowAsync(
            () =>
              createAragonScriptInterpreter([
                `act agent:0 vault "${invalidSignature}"`,
              ]).interpret(),
            {
              type: error.constructor,
              message: error.message,
            },
            `${msg} signature error mismatch`,
          );
        }),
      );
    });

    it('should fail when receiving invalid function params', async () => {
      const paramsErrors = [
        '-param 0 of type address: invalid address. Got 1000000000000000000',
        '-param 1 of type uint256: invalid BigNumber value. Got none',
      ];
      const error = new CommandError(
        'act',
        `error when encoding deposit call:\n${paramsErrors.join('\n')}`,
      );

      await expectThrowAsync(
        () =>
          createAragonScriptInterpreter([
            `act agent:0 vault "deposit(address,uint256)" 1e18`,
          ]).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
