import type { providers } from 'ethers';
import { Contract } from 'ethers';

import { getSystemApp, isSystemApp } from '.';
import type { Address, ParsedApp, Repo } from '../types';

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
  const { address, appId, repoName, roles, version } = app;
  const { registry } = app.repo || {};
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
    roles,
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

export const timeUnits: { [key: string]: number } = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2592000,
  y: 31536000,
};
