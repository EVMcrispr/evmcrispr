import type { Address } from "@evmcrispr/sdk";

/**
 * An intermediate app object that contains raw properties
 * that still need to be formatted and processed.
 */
export interface ParsedApp {
  /**
   * The app's address.
   */
  address: Address;
  appId: string;
  /**
   * The app's base contract address.
   */
  codeAddress: Address;
  contentUri?: string;
  /**
   * The app's name.
   */
  name: string;
  /**
   * The app's aragonPM ens registry name.
   */
  registryName?: string;
  /**
   * The app's roles.
   */
  roles: {
    roleHash: string;
    manager: string;
    grantees: { granteeAddress: Address }[];
  }[];
}
