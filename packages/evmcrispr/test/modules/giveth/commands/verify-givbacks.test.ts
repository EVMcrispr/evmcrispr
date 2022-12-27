import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { createInterpreter } from '../../../test-helpers/cas11';

describe.skip('Giveth > commands > verify-givbacks <ipfsHash> [voteId] [--relayer <relayer>] [--vote-if-correct]', () => {
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const testVerifyGivbacks =
    (
      ipfsHash: string,
      voteId: number | undefined,
      relayerAddr: string,
      voteIfCorrect: boolean,
    ) =>
    async () => {
      const interpreter = createInterpreter(
        `
          load giveth
          giveth:verify-givbacks ${ipfsHash} ${voteId ?? ''} ${
          voteIfCorrect ? '--vote-if-correct' : ''
        } ${relayerAddr ? `--relayer ${relayerAddr}` : ''}`,
        signer,
      );

      const interpreter2 = createInterpreter(
        `
        load aragonos
        aragonos:connect 0xA1514067E6fE7919FB239aF5259FfF120902b4f9 (
          exec voting:1 vote(uint,bool,bool) ${
            voteId ?? `(voting:1::votesLength() - 1)`
          } true true
        )`,
        signer,
      );

      const result = await interpreter.interpret();
      const result2 = voteIfCorrect ? await interpreter2.interpret() : [];

      expect(result).eql(result2);
    };

  const test =
    (voteId: number | undefined = undefined, relayerAddr = '') =>
    () => {
      it(
        'should return a success message if hash is correct',
        testVerifyGivbacks(
          'QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1',
          voteId,
          relayerAddr,
          false,
        ),
      );
      it.skip(
        'should return an error message if hash is incorrect',
        testVerifyGivbacks(
          'QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws2',
          voteId,
          relayerAddr,
          false,
        ),
      );
      it(
        'should return a success message and vote if hash is correct and --vote-if-correct is passed',
        testVerifyGivbacks(
          'QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1',
          voteId,
          relayerAddr,
          true,
        ),
      );
      it.skip(
        'should fail if hash is correct and --vote-if-correct is passed but the signer cannot vote',
        testVerifyGivbacks(
          'QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws2',
          voteId,
          relayerAddr,
          true,
        ),
      );
    };

  context('default relayer and latest vote', test());
  context('default relayer and specific vote', test(3));
  context(
    'custom relayer and latest vote',
    test(undefined, '0xCa60c66a8C3449047c213295eCd82C80B1529a10'),
  );
  context(
    'custom relayer and specific vote',
    test(3, '0xCa60c66a8C3449047c213295eCd82C80B1529a10'),
  );
});
