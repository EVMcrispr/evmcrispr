import type { Address } from '@1hive/evmcrispr';

import type { AragonArtifact } from './app';

/**
 * An intermediate app object that contains raw properties
 * that still need to be formatted and processed.
 */
export interface ParsedApp {
  /**
   * The app's address.
   */
  address: Address;
  /**
   * The app's Aragon artifact.
   */
  artifact: AragonArtifact;
  /**
   * The app's id.
   */
  appId: string;
  /**
   * The app's base contract address.
   */
  codeAddress: string;
  /**
   * The IPFS content identifier the app's data is located on.
   */
  contentUri: string;
  /**
   * The app's name.
   */
  name: string;
  /**
   * The app's aragonPM ens registry name.
   */
  registryName: string;
  /**
   * The app's roles.
   */
  roles: {
    roleHash: string;
    manager: string;
    grantees: { granteeAddress: Address }[];
  }[];
}

/**
 * An object that contains the app's repo data.
 */
export interface Repo {
  /**
   * The repo's app artifact.
   */
  artifact: any;
  /**
   * The IPFS content identifier the repo's app data is located on.
   */
  contentUri: string;
  /**
   * The repo's app base contract address.
   */
  codeAddress: string;
}
