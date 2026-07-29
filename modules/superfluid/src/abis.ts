import { parseAbi } from "viem";

// Signatures verified against the Superfluid protocol-monorepo interfaces
// (ethereum-contracts + automation-contracts) and
// docs.superfluid.org/docs/technical-reference, 2026-07-13.

/** CFAv1Forwarder read surface (writes go through encodeAction signatures). */
export const cfaForwarderAbi = parseAbi([
  "function getFlowrate(address token, address sender, address receiver) view returns (int96 flowrate)",
  "function getFlowInfo(address token, address sender, address receiver) view returns (uint256 lastUpdated, int96 flowrate, uint256 deposit, uint256 owedDeposit)",
  "function getAccountFlowrate(address token, address account) view returns (int96 flowrate)",
  "function getBufferAmountByFlowrate(address token, int96 flowrate) view returns (uint256 bufferAmount)",
  "function getFlowOperatorPermissions(address token, address sender, address flowOperator) view returns (uint8 permissions, int96 flowrateAllowance)",
]);

/** GDAv1Forwarder read surface. */
export const gdaForwarderAbi = parseAbi([
  "function isMemberConnected(address pool, address member) view returns (bool)",
  "function getFlowDistributionFlowRate(address token, address from, address to) view returns (int96)",
  "function getNetFlow(address token, address account) view returns (int96)",
  "function isPool(address token, address account) view returns (bool)",
]);

/** SuperfluidPool (the pool contract itself, read directly). */
export const superfluidPoolAbi = parseAbi([
  "function getUnits(address memberAddr) view returns (uint128)",
  "function getTotalUnits() view returns (uint128)",
  "function getMemberFlowRate(address memberAddr) view returns (int96)",
  "function getTotalFlowRate() view returns (int96)",
  "function getClaimableNow(address memberAddr) view returns (int256 claimableBalance, uint256 timestamp)",
  "function admin() view returns (address)",
  "function superToken() view returns (address)",
]);

/** SuperToken read surface (always 18 decimals). */
export const superTokenAbi = parseAbi([
  "function getUnderlyingToken() view returns (address)",
  "function getUnderlyingDecimals() view returns (uint8)",
  "function realtimeBalanceOfNow(address account) view returns (int256 availableBalance, uint256 deposit, uint256 owedDeposit, uint256 timestamp)",
  "function balanceOf(address account) view returns (uint256)",
]);

/** Minimal ERC20 read surface for underlying tokens. */
export const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/** VestingScheduler V3 reads used at plan time. */
export const vestingSchedulerAbi = parseAbi([
  "function getMaximumNeededTokenAllowance(address superToken, address sender, address receiver) view returns (uint256)",
  "function START_DATE_VALID_AFTER() view returns (uint32)",
  "function END_DATE_VALID_BEFORE() view returns (uint32)",
]);

/** Auto-Wrap Manager reads used at plan time. */
export const autowrapManagerAbi = parseAbi([
  "function minLower() view returns (uint64)",
  "function minUpper() view returns (uint64)",
]);
