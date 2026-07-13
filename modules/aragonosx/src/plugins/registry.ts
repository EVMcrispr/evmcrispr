import { ErrorNotFound } from "@evmcrispr/sdk";
import type { PluginInfo } from "../types";
import admin from "./admin";
import multisig from "./multisig";
import spp from "./spp";
import tokenVoting from "./token-voting";
import type { GovernanceAdapter } from "./types";

export const ADAPTERS: GovernanceAdapter[] = [
  admin,
  multisig,
  tokenVoting,
  spp,
];

/** Pick the governance adapter for an installed plugin by its repo subdomain. */
export function resolveAdapter(plugin: PluginInfo): GovernanceAdapter {
  const adapter = ADAPTERS.find(
    (a) =>
      plugin.repoSubdomain && a.repoSubdomains.includes(plugin.repoSubdomain),
  );

  if (!adapter) {
    const known = ADAPTERS.map((a) => a.id).join(", ");
    throw new ErrorNotFound(
      `no governance adapter for plugin ${plugin.identifier}${
        plugin.repoSubdomain ? ` (repo: ${plugin.repoSubdomain})` : ""
      }; supported: ${known}`,
    );
  }

  return adapter;
}
