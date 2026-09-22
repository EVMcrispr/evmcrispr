import type { Module } from "@evmcrispr/sdk";
import {
  getSmartCompileContext,
  type SmartAmount,
  smartRead,
} from "@evmcrispr/sdk/onchain";
import type { Address } from "viem";
import { readVaultUint as read4626 } from "../erc4626";
import {
  vaultShareBalance as balance,
  readVault7540Uint as read7540,
  vaultShare,
} from "../erc7540";

export async function readVaultUint(
  module: Module,
  vault: Address,
  fn: Parameters<typeof read4626>[2],
  args: readonly unknown[] = [],
): Promise<SmartAmount> {
  if (!getSmartCompileContext(module)) return read4626(module, vault, fn, args);
  const types =
    fn === "totalAssets"
      ? ""
      : ["balanceOf", "maxWithdraw"].includes(fn)
        ? "address"
        : "uint256";
  return smartRead(module, vault, `${fn}(${types})`, [...args]);
}
export async function readVault7540Uint(
  module: Module,
  vault: Address,
  fn: Parameters<typeof read7540>[2],
  args: readonly unknown[] = [],
): Promise<SmartAmount> {
  if (!getSmartCompileContext(module)) return read7540(module, vault, fn, args);
  return smartRead(
    module,
    vault,
    `${fn}(${args.length === 2 ? "uint256,address" : "address"})`,
    [...args],
  );
}
export async function vaultShareBalance(
  module: Module,
  vault: Address,
  owner: Address,
): Promise<SmartAmount> {
  return getSmartCompileContext(module)
    ? smartRead(module, await vaultShare(module, vault), "balanceOf(address)", [
        owner,
      ])
    : balance(module, vault, owner);
}
