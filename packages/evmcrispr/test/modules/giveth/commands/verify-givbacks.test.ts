import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { CommandError } from '../../../../src/errors';
import { defaultRelayerAddr } from '../../../../src/modules/giveth/addresses';

import { createInterpreter } from '../../../test-helpers/cas11';
import { expectThrowAsync } from '../../../test-helpers/expects';
import { findGivethCommandNode } from '../../../test-helpers/giveth';

describe('Giveth > commands > verify-givbacks <ipfsHash> <voteId> [--relayer <relayer>]', () => {
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const testVerifyGivbacks =
    (
      relayerAddr: string = defaultRelayerAddr,
      ipfsHash = 'QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr',
      voteId = 49,
    ) =>
    async () => {
      const interpreter = createInterpreter(
        relayerAddr === defaultRelayerAddr
          ? `
          load giveth
          giveth:verify-givbacks ${ipfsHash} ${voteId}`
          : `
          load giveth
          giveth:verify-givbacks ${ipfsHash} ${voteId} --relayer ${relayerAddr}`,
        signer,
      );

      const interpreter2 = createInterpreter(
        `
        load aragonos
        aragonos:connect 0xA1514067E6fE7919FB239aF5259FfF120902b4f9 (
          exec voting:1 vote(uint256,bool) ${voteId} true
        )`,
        signer,
      );

      const result = await interpreter.interpret();
      const result2 = await interpreter2.interpret();

      expect(result).eql(result2);
    };

  it('should return a correct verify-givbacks action', testVerifyGivbacks());
  it('should fail when hash do not match the vote', async () => {
    const ipfsHash = 'QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1';
    const voteId = 49;
    const interpreter = createInterpreter(
      `load giveth
        giveth:verify-givbacks ${ipfsHash} ${voteId}`,
      signer,
    );

    const c = findGivethCommandNode(interpreter.ast, 'verify-givbacks')!;
    const error = new CommandError(
      c,
      `Vote script does not match script in ${ipfsHash}`,
    );

    await expectThrowAsync(() => interpreter.interpret(), error);
  });
});
