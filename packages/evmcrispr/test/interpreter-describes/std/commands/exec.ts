import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import type { Action } from '../../../../src';
import { encodeActCall } from '../../../../src';
import { CommandError } from '../../../../src/errors';

import { toDecimals } from '../../../../src/utils';
import {
  createInterpreter,
  itChecksNonDefinedIdentifier,
} from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

export const execDescribe = (): Suite =>
  describe('when interpreting exec command', () => {
    let signer: Signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    const target = '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735';
    const params = ['0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6', '1200e18'];
    const resolvedParams = [
      '0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6',
      toDecimals(1200, 18),
    ];
    const fnSig = 'approve(address,uint256)';

    it('should return a correct contract call action', async () => {
      const expectedCallAction: Action[] = [
        {
          to: target,
          data: encodeActCall(fnSig, resolvedParams),
        },
      ];

      const interpreter = createInterpreter(
        `exec ${target} "${fnSig}" ${params.join(' ')}`,
        signer,
      );

      const result = await interpreter.interpret();

      expect(result).eql(expectedCallAction);
    });

    itChecksNonDefinedIdentifier(
      'should fail when receiving a non-defined target identifier',
      (nonDefinedIdentifier) =>
        createInterpreter(
          `
        exec ${nonDefinedIdentifier} "${fnSig}" 1e18
      `,
          signer,
        ),
    );

    it('should fail when receiving an invalid target address', async () => {
      const invalidTargetAddress = 'false';
      const error = new CommandError(
        'exec',
        `expected a valid target address, but got ${invalidTargetAddress}`,
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `exec ${invalidTargetAddress} "${fnSig}" 1e18`,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when providing an invalid signature', async () => {
      const invalidSignature = 'invalid(uint256,';
      const error = new CommandError(
        'exec',
        `expected a valid signature, but got ${invalidSignature}`,
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `exec ${target} "${invalidSignature}" 1e18`,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when providing invalid call params', async () => {
      const paramErrors = [
        '-param 0 of type address: invalid address. Got false',
      ];
      const error = new CommandError(
        'exec',
        `error when encoding approve call:\n${paramErrors.join('\n')}`,
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `exec ${target} "${fnSig}" false 1e18`,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
