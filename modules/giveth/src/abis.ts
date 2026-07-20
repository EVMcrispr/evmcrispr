import { parseAbi } from "viem";

// Read surfaces only — writes go through encodeAction signatures. Verified
// against Giveth/givpower contracts (GIVpower.sol, UnipoolGIVpower.sol,
// GardenUnipoolTokenDistributor.sol, TokenDistro.sol), 2026-07-20.

/** GIVpower LM (both garden and unipool flavors). */
export const givpowerAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function currentRound() view returns (uint256)",
  "function roundEndsIn() view returns (uint256)",
  "function calculatePower(uint256 amount, uint256 rounds) pure returns (uint256)",
  "function earned(address account) view returns (uint256)",
  // Total locked GIV (public struct getter: only the non-mapping field)
  "function userLocks(address account) view returns (uint256)",
  // UnipoolGIVpower only: raw GIV staked (garden tracks it as gGIV balance)
  "function depositTokenBalance(address account) view returns (uint256)",
]);

/** TokenDistro (GIVstream). */
export const tokenDistroAbi = parseAbi([
  "function claimableNow(address account) view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);
