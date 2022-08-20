import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';

import { NodeType } from '../../../../src/cas11/types';
import { ComparisonType } from '../../../../src/cas11/utils';
import { HelperFunctionError } from '../../../../src/errors';
import {
  itChecksInvalidArgsLength,
  runExpression,
} from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';

const PINATA_JWT = process.env.VITE_PINATA_JWT;

const JWT_VAR_NAME = 'ipfs.jwt';

export const ipfsDescribe = (): Suite =>
  describe('@ipfs(text)', () => {
    if (!PINATA_JWT) {
      throw new Error('PINATA_JWT not defined in environment variables.');
    }

    let signer: Signer;
    const lazySigner = () => signer;
    const ipfsData = 'This should be pinned in IPFS';

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    it('should upload text to IPFS and return hash', async () => {
      const ipfsHash = await runExpression(
        `@ipfs('${ipfsData}')`,
        signer,
        undefined,
        [`set $std:${JWT_VAR_NAME} ${PINATA_JWT}`],
      );

      expect(ipfsHash).to.equals(
        'QmeA34sMpR2EZfVdPsxYk7TMLxmQxhcgNer67UyTkiwKns',
      );
    });

    it('should fail when not setting pinata JWT variable', async () => {
      const error = new HelperFunctionError(
        'ipfs',
        '$std:ipfs.jwt is not defined. Go to pinata.cloud and obtain your API key, please',
      );

      await expectThrowAsync(
        () => runExpression("@ipfs('some text')", signer),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    it('should fail when setting an invalid pinata JWT', async () => {
      const error = new HelperFunctionError(
        'ipfs',
        'an error occurred while uploading data to IPFS: Invalid/expired credentials',
      );

      await expectThrowAsync(
        () =>
          runExpression('@ipfs("someText")', signer, undefined, [
            `set $std:ipfs.jwt "an invalid JWT"`,
          ]),
        {
          type: error.constructor,
          message: error.message,
        },
      );
    });

    itChecksInvalidArgsLength(
      NodeType.HelperFunctionExpression,
      '@ipfs',
      [`'${ipfsData}'`],
      { type: ComparisonType.Equal, minValue: 1 },
      lazySigner,
    );
  });
