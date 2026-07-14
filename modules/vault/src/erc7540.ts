import type { Module } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { Abi, Address, Hex } from "viem";
import { parseAbi } from "viem";
import { readVaultUint } from "./erc4626";

/** ERC-165 interface ids for the ERC-7540/ERC-7575 surfaces. */
export const INTERFACE_IDS = {
  erc7540Operator: "0xe3bc4e65",
  asyncDeposit: "0xce3bbe50",
  asyncRedeem: "0x620ee8e4",
  erc7575Vault: "0x2f0a18c5",
  erc7575Share: "0xf815c03d",
} as const satisfies Record<string, Hex>;

/** Minimal ERC-7540 (+ ERC-165/ERC-7575) read surface used at build time. */
export const erc7540Abi = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function share() view returns (address)",
  "function pendingDepositRequest(uint256 requestId, address controller) view returns (uint256)",
  "function claimableDepositRequest(uint256 requestId, address controller) view returns (uint256)",
  "function pendingRedeemRequest(uint256 requestId, address controller) view returns (uint256)",
  "function claimableRedeemRequest(uint256 requestId, address controller) view returns (uint256)",
  "function isOperator(address controller, address operator) view returns (bool)",
  "function maxDeposit(address controller) view returns (uint256)",
  "function maxMint(address controller) view returns (uint256)",
  "function maxWithdraw(address controller) view returns (uint256)",
  "function maxRedeem(address controller) view returns (uint256)",
]);

type Vault7540ReadFn =
  | "pendingDepositRequest"
  | "claimableDepositRequest"
  | "pendingRedeemRequest"
  | "claimableRedeemRequest"
  | "maxDeposit"
  | "maxMint"
  | "maxWithdraw"
  | "maxRedeem";

function notA7540Vault(vault: Address, fn: string): ErrorException {
  return new ErrorException(
    `${vault} does not look like an ERC-7540 vault (${fn}() reverted or returned no data)`,
  );
}

/**
 * ERC-165 introspection; plain ERC-4626 vaults often don't implement it, so
 * a revert or empty response counts as "not supported".
 */
export async function supportsInterface(
  module: Module,
  address: Address,
  interfaceId: Hex,
): Promise<boolean> {
  const client = await module.getClient();
  try {
    return (await client.readContract({
      address,
      abi: erc7540Abi as Abi,
      functionName: "supportsInterface",
      args: [interfaceId],
    })) as boolean;
  } catch {
    return false;
  }
}

export function isAsyncDepositVault(
  module: Module,
  vault: Address,
): Promise<boolean> {
  return supportsInterface(module, vault, INTERFACE_IDS.asyncDeposit);
}

export function isAsyncRedeemVault(
  module: Module,
  vault: Address,
): Promise<boolean> {
  return supportsInterface(module, vault, INTERFACE_IDS.asyncRedeem);
}

/**
 * Share token of a vault. ERC-7575 vaults expose it via share(); plain
 * ERC-4626 vaults are their own share token, so fall back to the vault
 * address when share() is absent.
 */
export async function vaultShare(
  module: Module,
  vault: Address,
): Promise<Address> {
  const client = await module.getClient();
  try {
    return (await client.readContract({
      address: vault,
      abi: erc7540Abi as Abi,
      functionName: "share",
    })) as Address;
  } catch {
    return vault;
  }
}

/** uint256 view read on the ERC-7540 surface with a clear error message. */
export async function readVault7540Uint(
  module: Module,
  vault: Address,
  functionName: Vault7540ReadFn,
  args: readonly unknown[],
): Promise<bigint> {
  const client = await module.getClient();
  try {
    return (await client.readContract({
      address: vault,
      abi: erc7540Abi as Abi,
      functionName,
      args,
    })) as bigint;
  } catch {
    throw notA7540Vault(vault, functionName);
  }
}

/**
 * Share balance of an account, read on the vault's share token (which is the
 * vault itself for plain ERC-4626 vaults).
 */
export async function vaultShareBalance(
  module: Module,
  vault: Address,
  owner: Address,
): Promise<bigint> {
  const share = await vaultShare(module, vault);
  if (share === vault) {
    return readVaultUint(module, vault, "balanceOf", [owner]);
  }
  const client = await module.getClient();
  try {
    return (await client.readContract({
      address: share,
      abi: parseAbi([
        "function balanceOf(address account) view returns (uint256)",
      ]) as Abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
  } catch {
    throw new ErrorException(
      `${share} does not look like a share token (balanceOf() reverted or returned no data)`,
    );
  }
}

export async function requireAsyncDeposit(
  module: Module,
  vault: Address,
): Promise<void> {
  if (!(await isAsyncDepositVault(module, vault))) {
    throw new ErrorException(
      `${vault} is not an asynchronous-deposit vault (ERC-7540). Use vault:deposit instead`,
    );
  }
}

export async function requireAsyncRedeem(
  module: Module,
  vault: Address,
): Promise<void> {
  if (!(await isAsyncRedeemVault(module, vault))) {
    throw new ErrorException(
      `${vault} is not an asynchronous-redeem vault (ERC-7540). Use vault:redeem or vault:withdraw instead`,
    );
  }
}

export async function requireOperatorSupport(
  module: Module,
  vault: Address,
): Promise<void> {
  if (
    !(await supportsInterface(module, vault, INTERFACE_IDS.erc7540Operator))
  ) {
    throw new ErrorException(
      `${vault} does not support ERC-7540 operators (setOperator)`,
    );
  }
}
