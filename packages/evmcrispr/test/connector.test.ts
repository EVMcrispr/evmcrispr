import { expect } from 'chai';
import type { Signer } from 'ethers';
import { utils } from 'ethers';
import hre, { ethers } from 'hardhat';
import { multihash } from 'is-ipfs';

import { ErrorException, ErrorNotFound } from '../src';
import { DAO, EOA_ADDRESS } from './fixtures';
import {
  expectThrowAsync,
  isValidArtifact,
  isValidParsedApp,
} from './test-helpers/expects';
import { Connector } from '../src/modules/aragonos/Connector';
import { parseContentUri } from '../src/modules/aragonos/utils';
import type { ParsedApp } from '../src/modules/aragonos/types';

const {
  network: {
    config: { chainId },
  },
} = hre;

describe('Connector', () => {
  let connector: Connector;
  let signer: Signer;

  before(async () => {
    connector = new Connector(chainId || 4);
    signer = (await ethers.getSigners())[0];
  });

  it('should fail when creating a connector with an unknown chain id', () => {
    expectThrowAsync(() => new Connector(999), new ErrorException());
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

    before(async () => {
      daoApps = await connector.organizationApps(DAO.kernel, signer.provider!);
    });

    it('should find the apps of a valid dao', () => {
      expect(daoApps.length).to.be.greaterThan(0);
    });

    it('should return valid apps', () => {
      daoApps.forEach((app) => isValidParsedApp(app));
    });

    it('should fail when fetching the apps of a non-existent dao', async () => {
      await expectThrowAsync(
        () => connector.organizationApps(EOA_ADDRESS, signer.provider!),
        new ErrorNotFound('Organization apps not found'),
      );
    });
  });
});
