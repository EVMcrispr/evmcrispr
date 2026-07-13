import type { Module } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Abi, Address } from "viem";
import { parseAbi } from "viem";

/** Minimal ERC-4626 (+ ERC-20 balanceOf) read surface used at build time. */
export const erc4626Abi = parseAbi([
  "function asset() view returns (address)",
  "function previewMint(uint256 shares) view returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

type VaultReadFn =
  | "previewMint"
  | "maxWithdraw"
  | "convertToAssets"
  | "convertToShares"
  | "totalAssets"
  | "balanceOf";

function notAVault(vault: Address, fn: string): ErrorException {
  return new ErrorException(
    `${vault} does not look like an ERC-4626 vault (${fn}() reverted or returned no data)`,
  );
}

/** Underlying asset of a vault; fails with a clear message on non-4626 addresses. */
export async function vaultAsset(
  module: Module,
  vault: Address,
): Promise<Address> {
  const client = await module.getClient();
  try {
    return (await client.readContract({
      address: vault,
      abi: erc4626Abi as Abi,
      functionName: "asset",
    })) as Address;
  } catch {
    throw notAVault(vault, "asset");
  }
}

/** uint256 view read on a vault with the same non-4626 error wrapping. */
export async function readVaultUint(
  module: Module,
  vault: Address,
  functionName: VaultReadFn,
  args: readonly unknown[] = [],
): Promise<bigint> {
  const client = await module.getClient();
  try {
    return (await client.readContract({
      address: vault,
      abi: erc4626Abi as Abi,
      functionName,
      args,
    })) as bigint;
  } catch {
    throw notAVault(vault, functionName);
  }
}
