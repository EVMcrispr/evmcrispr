import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import type { Action } from '../../../../src';
import { encodeActCall } from '../../../../src';

import { toDecimals } from '../../../../src/utils';
import { createInterpreter } from '../../../test-helpers/cas11';

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

    it('should encode a call method correctly', async () => {
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

    // it('should fail when providing an invalid signature', async () => {
    //   const interpreter = createInterpreter(
    //     `exec ${target} "invalid(uint256," 1e18`,
    //   );

    // });
  });
