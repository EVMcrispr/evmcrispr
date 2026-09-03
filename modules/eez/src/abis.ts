import { parseAbi } from "viem";

/** Shared surface of the L1 `EEZ` registry and the rollup `EEZL2` predeploy. */
export const eezBaseAbi = parseAbi([
  "function createCrossChainProxy(address originalAddress, uint64 originalRollupId) returns (address proxy)",
  "function computeCrossChainProxyAddress(address originalAddress, uint64 originalRollupId) view returns (address)",
  "function authorizedProxies(address proxy) view returns (bool exists, address originalAddress, uint64 originalRollupId)",
  "event CrossChainProxyCreated(address indexed proxy, address indexed originalAddress, uint64 indexed originalRollupId)",
]);

/** A `CrossChainProxy`. `executeBatch` runs ERC-7579 `Execution[]` calls
 *  as the proxy, atomically; the proxy accepts it only from itself, which
 *  is how it arrives when its own account on the other chain calls the
 *  proxy of this proxy. Any other caller is forwarded like any calldata. */
export const crossChainProxyAbi = parseAbi([
  "function executeBatch(bytes executionData) payable",
]);
