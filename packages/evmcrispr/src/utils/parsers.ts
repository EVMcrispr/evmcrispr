import { getSystemApp, isSystemApp } from '.';
import type { ParsedApp, Repo } from '../types';

export const parseAppArtifactName = (name: string): string => {
  if (!name) {
    return '';
  }
  // Split by the first '.' occurrence only.
  const parsedName = name.split(/\.(.+)/);

  return parsedName.length > 1 ? parsedName[1] : '';
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const parseApp = (app: any): ParsedApp => {
  const { address, appId, implementation, repoName, roles, version } = app;
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
    codeAddress: codeAddress ?? implementation.address,
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
