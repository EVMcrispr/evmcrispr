import type { Address } from "@evmcrispr/sdk";
import { fetchImplementationAddress } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import type { ParsedApp, Repo } from "../types";
import { getSystemApp, isSystemApp } from "./interfaces";

export const parseAppArtifactName = (name: string): string => {
  if (!name) {
    return "";
  }
  // Split by the first '.' occurrence only.
  const parsedName = name.split(/\.(.+)/);

  return parsedName.length > 1 ? parsedName[1] : "";
};

export const parseApp = async (
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  app: any,
  client: PublicClient,
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
      codeAddress ?? (await fetchImplementationAddress(address, client)),
    contentUri,
    name,
    registryName: registry?.name,
    roles: (roles as any[]).map((role) => ({
      ...role,
      roleHash: role.hash ?? role.roleHash,
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
