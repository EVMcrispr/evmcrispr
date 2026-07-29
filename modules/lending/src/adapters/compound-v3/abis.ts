import { parseAbi } from "viem";

// Comet: one contract per market, holding both the money market and its
// configuration (verified against the deployed comets 2026-07).
export const cometAbi = parseAbi([
  "function baseToken() view returns (address)",
  "function baseScale() view returns (uint64)",
  "function baseTokenPriceFeed() view returns (address)",
  "function numAssets() view returns (uint8)",
  "function getAssetInfo(uint8 i) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getAssetInfoByAddress(address asset) view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function getUtilization() view returns (uint256)",
  "function getSupplyRate(uint256 utilization) view returns (uint64)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
  "function borrowBalanceOf(address account) view returns (uint256)",
  "function collateralBalanceOf(address account, address asset) view returns (uint128)",
]);
