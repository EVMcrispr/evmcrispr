import { parseAbi } from "viem";

/** Shared surface of the L1 `EEZ` registry and the rollup `EEZL2` predeploy. */
export const eezBaseAbi = parseAbi([
  "function createCrossChainProxy(address originalAddress, uint64 originalRollupId) returns (address proxy)",
  "function computeCrossChainProxyAddress(address originalAddress, uint64 originalRollupId) view returns (address)",
  "function authorizedProxies(address proxy) view returns (bool exists, address originalAddress, uint64 originalRollupId)",
  "event CrossChainProxyCreated(address indexed proxy, address indexed originalAddress, uint64 indexed originalRollupId)",
]);
