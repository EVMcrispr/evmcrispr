import { createInterpreter } from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

describe('Giveth > commands > initiate-givbacks <ipfsHash> [--relayer <relayer>]', () => {
  let signer: Signer;
  const defaultRelayerAddr = '0xd0e81E3EE863318D0121501ff48C6C3e3Fd6cbc7';

  before(async () => {
    [signer] = await ethers.getSigners();
  });

  const testInitiateGivbacks =
    (relayerAddr: string = defaultRelayerAddr) =>
    async () => {
      const ipfsHash = 'QmYYpntQPV3CSeCGKUZSYK2ET6czvrwqtDQdzopoqUwws1';

      const interpreter = createInterpreter(
        relayerAddr === defaultRelayerAddr
          ? `
          load giveth
          giveth:initiate-givbacks ${ipfsHash}`
          : `
          load giveth
          giveth:initiate-givbacks ${ipfsHash} --relayer ${relayerAddr}`,
        signer,
      );

      const interpreter2 = createInterpreter(
        `
        load aragonos
        aragonos:connect 0xA1514067E6fE7919FB239aF5259FfF120902b4f9 token-manager voting:1 (
          act agent ${relayerAddr} addBatches(bytes32[],bytes) [0x681908fe6a73c6bcbb039cf71269561d58a4e8ad4ab316451fbd5f7423694732,0x1abe4e1a1269a836a96c7cf29809f11dd6ff5739ba5220d23a6df45c4fa0e156,0x48554c7d43c2cf69aee0175ae29937f6f22e0ce3f9dc8f82196b38335e2e616c,0x6264a3b3d30d509edbf1d6fbf41beb2ce2d30a85189399f4a02c7ce89df40f4e,0x3b4e8c897b78d0cf6d2f58ff6354b4ae15e0e9f7a0c41e108c9120e86efd3501,0x98f30189079a971755dac4742b04a27f46c4ef6a06a6fa83dce98c0e75e2ed42] ${ipfsHash}
        )`,
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
