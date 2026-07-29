import type { Abi, Address } from "@evmcrispr/sdk";
import type { PermissionMap } from "./permission";

/**
 * An object that contains app data.
 */
export interface App {
  /**
   * The app's contract ABI [Interface](https://docs.ethers.io/v5/api/utils/abi/interface/).
   */
  abi: Abi;
  /**
   * The app's address.
   */
  address: Address;
  /**
   * The app's base contract address.
   */
  codeAddress: Address;
  /**
   * The app's aragonPM content URI, when available from the subgraph.
   */
  contentUri: string;
  /**
   * The app's name.
   */
  name: string;
  /**
   * The app's permissions.
   */
  permissions: PermissionMap;
  /**
   * The app's aragonPM ens registry name.
   */
  registryName: string;
}

export interface AppRole {
  name: string;
  id: string;
  params: string[];
  bytes: string;
}

/** @internal */
export interface AppResource {
  abi: Abi;
  appName: string;
  roles: AppRole[];
  functions: { sig: string }[];
}

/**
 * The name of an app as it appears in the APM excluding the default registry ens name,
 * optionally qualified by a non-default registry prefix (e.g. `vault`, `voting.open`).
 * When several apps share a name, they are addressed by their chronological installation
 * index through `@app(<name> <index>)`.
 */
export type AppIdentifier = string;
