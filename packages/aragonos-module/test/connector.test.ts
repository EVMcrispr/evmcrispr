import { ErrorException, ErrorNotFound } from '@1hive/evmcrispr';
import {
  DAO,
  EOA_ADDRESS,
  expectThrowAsync,
} from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import hre, { ethers } from 'hardhat';
import { multihash } from 'is-ipfs';

import { Connector } from '../src/Connector';
import type { ParsedApp } from '../src/types';
import { parseContentUri } from '../src/utils';
import { isValidArtifact, isValidParsedApp } from './utils';

const {
  network: {
    config: { chainId },
  },
} = hre;

const GOERLI_DAO_ADDRESS = '0xd8765273da3a7f7a4dc184e8a9f8a894e4dfb4c4';

describe('AragonOS > Connector', () => {
  let connector: Connector;
  let goerliConnector: Connector;
  let signer: Signer;

  before(async () => {
    signer = (await ethers.getSigners())[0];
    const provider = signer.provider!;

    connector = new Connector(chainId || 4, provider);
    goerliConnector = new Connector(5, provider);
  });

  it('should fail when creating a connector with an unknown chain id', () => {
    expectThrowAsync(
      () => new Connector(999, signer.provider!),
      new ErrorException(),
    );
  });

  describe('repo()', () => {
    it('should find a valid repo', async () => {
      const { codeAddress, contentUri, artifact } = await connector.repo(
        'token-manager',
        'aragonpm.eth',
      );

      expect(utils.isAddress(codeAddress), 'Invalid  repo code address').to.be
        .true;

      expect(multihash(parseContentUri(contentUri)), 'Invalid repo contentUri')
        .to.be.true;

      if (artifact) {
        isValidArtifact(artifact);
      }
    });

    it('should fail when fetching a non-existent repo', async () => {
      await expectThrowAsync(
        () => connector.repo('non-existent-repo', 'aragonpm.eth'),
        new ErrorNotFound('Repo non-existent-repo.aragonpm.eth not found', {
          name: 'ErrorRepoNotFound',
        }),
      );
    });
  });

  describe('organizationApps()', () => {
    let daoApps: ParsedApp[];
    let goerliDaoApps: ParsedApp[];

    before(async () => {
      daoApps = await connector.organizationApps(DAO.kernel);
      goerliDaoApps = await goerliConnector.organizationApps(
        GOERLI_DAO_ADDRESS,
      );
    });

    describe("when fetching apps from a non-goerli's dao", () => {
      it('should find the apps', () => {
        expect(daoApps.length).to.be.greaterThan(0);
      });

      it('should return valid parsed apps', () => {
        daoApps.forEach((app) => isValidParsedApp(app));
      });
    });

    describe("when fetching apps from a goerli's dao", () => {
      it('should find the apps', () => {
        expect(goerliDaoApps.length).to.be.greaterThan(0);
      });

      it('shole return valid parsed apps', () => {
        goerliDaoApps.forEach((app) => isValidParsedApp(app));
      });
    });

    it('should fail when fetching the apps of a non-existent dao', async () => {
      await expectThrowAsync(
        () => connector.organizationApps(EOA_ADDRESS),
        new ErrorNotFound('Organization apps not found'),
      );
    });
  });
});
