import { expectHash } from '@1hive/evmcrispr-test-common';
import { expect } from 'chai';
import { isAddress } from 'ethers/lib/utils';
import { multihash } from 'is-ipfs';

import type { AragonArtifact, ParsedApp } from '../../src/types';
import { parseContentUri } from '../../src/utils';

export const isValidArtifact = (artifact: AragonArtifact): void => {
  const { appName, abi, roles } = artifact;

  expect(appName, 'Artifact name not found').to.not.be.null;

  expect(abi.length, 'Artifact ABI not found').to.be.greaterThan(0);

  roles.forEach(({ bytes, id, name }) => {
    expectHash(bytes, 'Invalid artifact role hash');
    expect(id, 'Artifact role id not found').to.not.be.empty;
    expect(name, 'Artifact role name not found').to.not.be.empty;
  });
};

export const isValidParsedApp = (app: ParsedApp): void => {
  const { address, appId, artifact, codeAddress, contentUri, name, roles } =
    app;

  expect(isAddress(address), 'Invalid app address').to.be.true;

  expectHash(appId, 'Invalid appId');

  expect(isAddress(codeAddress), 'Invalid app code address').to.be.true;

  if (contentUri) {
    expect(multihash(parseContentUri(contentUri)), 'Invalid contentUri').to.be
      .true;
  }

  expect(name, 'App name missing').to.not.be.empty;

  expect(app).has.property('artifact');

  if (artifact) {
    isValidArtifact(artifact);
  }

  roles.forEach(({ manager, grantees, roleHash }) => {
    expect(isAddress(manager), 'Invalid app role manager').to.be.true;

    grantees.forEach(({ granteeAddress }) => {
      expect(isAddress(granteeAddress), 'Invalid app role grantee address').to
        .be.true;
    });

    expectHash(roleHash, 'Invalid app role hash');
  });
};
