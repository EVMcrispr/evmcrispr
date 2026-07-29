import type { Address } from "@evmcrispr/sdk";

export interface VersionTag {
  release: number;
  build: number;
}

/** An installed plugin instance of a connected DAO. */
export interface PluginInfo {
  address: Address;
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
  /** Installed plugins in chronological installation order. */
  plugins: PluginInfo[];
}

/** Discovery result before identifiers are assigned. */
export interface RawPlugin {
  address: Address;
  repoSubdomain?: string;
  repoAddress?: Address;
  versionTag?: VersionTag;
  helpers: Address[];
}
