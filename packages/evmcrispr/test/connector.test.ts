import { expect } from 'chai';
import { utils } from 'ethers';
import hre from 'hardhat';
import { multihash } from 'is-ipfs';

import { ErrorException, ErrorNotFound } from '../src';
import { parseContentUri } from '../src/utils';
import type { ParsedApp } from '../src/types';
import { DAO, EOA_ADDRESS } from './fixtures';
import {
  expectThrowAsync,
  isValidArtifact,
  isValidParsedApp,
} from './test-helpers/expects';
import Connector from '../src/modules/aragonos/utils/Connector';

const {
  network: {
    config: { chainId },
  },
} = hre;

describe('Connector', () => {
  let connector: Connector;

  before(() => {
    connector = new Connector(chainId || 4);
  });

  it('should fail when creating a connector with an unknown chain id', () => {
    expectThrowAsync(() => new Connector(999), { type: ErrorException });
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
        { type: ErrorNotFound },
      );
    });
  });

  describe('organizationApps()', () => {
    let daoApps: ParsedApp[];

    before(async () => {
      daoApps = await connector.organizationApps(DAO.kernel);
    });

    it('should find the apps of a valid dao', () => {
      expect(daoApps.length).to.be.greaterThan(0);
    });

    it('should return valid apps', () => {
      daoApps.forEach((app) => isValidParsedApp(app));
    });

    it('should fail when fetching the apps of a non-existent dao', async () => {
      await expectThrowAsync(() => connector.organizationApps(EOA_ADDRESS), {
        type: ErrorNotFound,
      });
    });
  });
});
