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

const ETHERSCAN_API = process.env.ETHERSCAN_API;

export const execDescribe = (): Suite =>
  describe.only('when interpreting exec command', () => {
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

    it('should return a correct exec action', async () => {
      const interpreter = createInterpreter(
        `exec ${target} ${fnSig} ${params.join(' ')}`,
        signer,
      );

      const result = await interpreter.interpret();

      const expectedCallAction: Action[] = [
        {
          to: target,
          data: encodeActCall(fnSig, resolvedParams),
        },
      ];

      expect(result).eql(expectedCallAction);
    });

    it("should return exec action when receiving just the method's name", async () => {
      const interpreter = createInterpreter(
        `
        set $std:etherscanAPI  ${ETHERSCAN_API}
        exec ${target} transfer @me 1500e18
        `,
        signer,
      );

      const callActions = await interpreter.interpret();

      const expectedCallActions: Action[] = [
        {
          to: target,
          data: encodeActCall('transfer(address,uint256)', [
            await signer.getAddress(),
            toDecimals(1500),
          ]),
        },
      ];

      expect(callActions).to.eql(expectedCallActions);
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
            `exec ${invalidTargetAddress} ${fnSig} 1e18`,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when providing an invalid signature', async () => {
      const invalidSignature = 'invalid(uint256,)';
      const error = new CommandError(
        'exec',
        `error when getting function from ABI - no matching function (argument="signature", value="invalid(uint256,)", code=INVALID_ARGUMENT, version=abi/5.6.2)`,
      );

      await expectThrowAsync(
        () =>
          createInterpreter(
            `
            set $std:etherscanAPI ${ETHERSCAN_API}
            exec ${target} ${invalidSignature} 1e18`,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it(
      "should fail when providing a method's name whose contract ABI isn't found",
    );

    it("should fail when providing an ABI duplicated method's name");

    it(
      "should fail when providing a method's name of a contract which isn't verified",
    );

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
            `exec ${target} ${fnSig} false 1e18`,
            signer,
          ).interpret(),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });
  });
