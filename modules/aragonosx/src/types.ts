import type { Address } from "@evmcrispr/sdk";

export interface VersionTag {
  release: number;
  build: number;
}

/** An installed plugin instance of a connected DAO. */
export interface PluginInfo {
  address: Address;
  /**
   * Identifier within the DAO: the repo subdomain, suffixed with `:<n>` for
   * repeated installs (`token-voting`, `token-voting:1`). Plugins from
   * unknown repos are identified by their lowercase address.
   */
  identifier: string;
  repoSubdomain?: string;
  repoAddress?: Address;
  versionTag?: VersionTag;
  /** Helper contracts of the applied preparation (needed to uninstall/update). */
  helpers: Address[];
}

/** A connected Aragon OSx DAO. */
export interface DaoContext {
  address: Address;
  /** ENS subdomain the DAO was registered with, when known. */
  subdomain?: string;
  plugins: PluginInfo[];
  nestingIndex: number;
}

/** Discovery result before identifiers are assigned. */
export interface RawPlugin {
  address: Address;
  repoSubdomain?: string;
  repoAddress?: Address;
  versionTag?: VersionTag;
  helpers: Address[];
}
