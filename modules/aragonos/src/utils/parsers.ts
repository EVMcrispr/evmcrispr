import { fetchImplementationAddress } from "@evmcrispr/sdk";
import type { PublicClient } from "viem";
import type { ParsedApp } from "../types";
import { getSystemApp, isSystemApp } from "./interfaces";

export const parseApp = async (
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  app: any,
  client: PublicClient,
): Promise<ParsedApp> => {
  const { address, appId, roles, version } = app;
  const { name: repoName, registry } = app.repo || {};
  const { codeAddress, contentUri } = version || {};
  let name;

  if (isSystemApp(appId)) {
    const systemApp = getSystemApp(appId)!;
    name = systemApp.name;
  } else {
    name = repoName;
  }

  return {
    address,
    appId,
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
