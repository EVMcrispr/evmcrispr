import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { createInterpreter } from '../../../test-helpers/cas11';
import { defaultRelayerMap } from '../../../../src/modules/giveth/addresses';

const defaultRelayerAddr = defaultRelayerMap.get(100)!;

describe('Giveth > commands > finalize-givbacks <ipfsHash> [--relayer <relayer>]', () => {
  let signer: Signer;

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const testInitiateGivbacks =
    (relayerAddr: string = defaultRelayerAddr) =>
    async () => {
      const ipfsHash = 'QmdERB7Mu5e7TPzDpmNtY12rtvj9PB89pXUGkssoH7pvyr';

      const interpreter = createInterpreter(
        relayerAddr === defaultRelayerAddr
          ? `
          load giveth
          giveth:finalize-givbacks ${ipfsHash}`
          : `
          load giveth
          giveth:finalize-givbacks ${ipfsHash} --relayer ${relayerAddr}`,
        signer,
      );

      const batches = await fetch(
        'https://ipfs.blossom.software/ipfs/' + ipfsHash,
      ).then((data) => data.json());

      const interpreter2 = createInterpreter(
        batches
          .map(
            (batch: any) =>
              `exec ${relayerAddr} executeBatch(uint256,address[],uint256[]) ${
                batch.nonce
              } [${batch.recipients.join(',')}] [${batch.amounts.join(',')}]`,
          )
          .join('\n'),
        signer,
      );

      const result = await interpreter.interpret();
      const result2 = await interpreter2.interpret();

      expect(result).eql(result2);
    };

  it(
    'should return a correct initiate-givbacks action',
    testInitiateGivbacks(),
  );
  it(
    'should return a correct initiate-givbacks action when another relayer is passed',
    testInitiateGivbacks('0xCa60c66a8C3449047c213295eCd82C80B1529a10'),
  );
});
