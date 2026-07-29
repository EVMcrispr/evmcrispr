import { ErrorException } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { isHex, keccak256, stringToHex } from "viem";

/** Permission ids defined by DAO.sol itself. */
export const DAO_PERMISSIONS = [
  "ROOT_PERMISSION",
  "EXECUTE_PERMISSION",
  "UPGRADE_DAO_PERMISSION",
  "SET_METADATA_PERMISSION",
  "SET_TRUSTED_FORWARDER_PERMISSION",
  "REGISTER_STANDARD_CALLBACK_PERMISSION",
  "VALIDATE_SIGNATURE_PERMISSION",
];

/**
 * Normalize a permission name to the OSx convention: uppercase with
 * underscores and a `_PERMISSION` suffix (`execute` → `EXECUTE_PERMISSION`).
 */
export function normalizePermissionName(raw: string): string {
  const name = raw.toUpperCase().replace(/-/g, "_");
  return name.endsWith("_PERMISSION") ? name : `${name}_PERMISSION`;
}

/**
 * Resolve a permission argument to its bytes32 id: pass 0x-hashes through,
 * hash names with keccak256 (`EXECUTE` → keccak256("EXECUTE_PERMISSION")).
 */
export function permissionId(raw: string): Hex {
  if (raw.startsWith("0x")) {
    if (!isHex(raw) || raw.length !== 66) {
      throw new ErrorException(
        `invalid permission id ${raw}: expected a bytes32 value`,
      );
    }
    return raw as Hex;
  }
  return keccak256(stringToHex(normalizePermissionName(raw)));
}
