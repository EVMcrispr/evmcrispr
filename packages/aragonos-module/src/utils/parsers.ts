import type { Address } from '@1hive/evmcrispr';
import type { providers } from 'ethers';
import { Contract } from 'ethers';

import type { ParsedApp, Repo } from '../types';
import { getSystemApp, isSystemApp } from './interfaces';

export const parseAppArtifactName = (name: string): string => {
  if (!name) {
    return '';
  }
  // Split by the first '.' occurrence only.
  const parsedName = name.split(/\.(.+)/);

  return parsedName.length > 1 ? parsedName[1] : '';
};

const fetchImplementationAddress = (
  appAddress: Address,
  provider: providers.Provider,
): Promise<Address> => {
  const app = new Contract(
    appAddress,
    ['function implementation() public view returns (address)'],
    provider,
  );

  return app.implementation();
};

export const parseApp = async (
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  app: any,
  provider: providers.Provider,
): Promise<ParsedApp> => {
  const { address, appId, roles, version } = app;
  const { name: repoName, registry } = app.repo || {};
  const { codeAddress, artifact: rawArtifact, contentUri } = version || {};
  let artifact, name;

  if (isSystemApp(appId)) {
    const systemApp = getSystemApp(appId)!;
    artifact = systemApp.artifact;
    name = systemApp.name;
  } else {
    artifact = JSON.parse(rawArtifact ?? null);
    name = repoName;
  }

  return {
    address,
    appId,
    artifact,
    codeAddress:
      codeAddress ?? (await fetchImplementationAddress(address, provider)),
    contentUri,
    name,
    registryName: registry?.name,
    roles: (roles as any[]).map((role) => ({
      ...role,
      roleHash: role['hash'] ?? role['roleHash'],
    })),
  };
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const parseRepo = (repo: any): Repo => {
  const { artifact: rawArtifact, contentUri, codeAddress } = repo.lastVersion;

  return {
    artifact: JSON.parse(rawArtifact),
    contentUri,
    codeAddress,
  };
};
