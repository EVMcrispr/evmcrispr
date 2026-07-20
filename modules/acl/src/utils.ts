import { ErrorException, isNum, Num } from "@evmcrispr/sdk";
import type { Hex } from "viem";
import { isHex, keccak256, parseAbi, toHex } from "viem";

export const ownableAbi = parseAbi([
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
]);

export const accessControlAbi = parseAbi([
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
]);

export const accessManagerAbi = parseAbi([
  "function hasRole(uint64 roleId, address account) view returns (bool isMember, uint32 executionDelay)",
  "function getRoleAdmin(uint64 roleId) view returns (uint64)",
  "function canCall(address caller, address target, bytes4 selector) view returns (bool immediate, uint32 delay)",
  "function hashOperation(address caller, address target, bytes data) view returns (bytes32)",
  "function getSchedule(bytes32 id) view returns (uint48)",
]);

export const defaultAdminRulesAbi = parseAbi([
  "function defaultAdmin() view returns (address)",
  "function pendingDefaultAdmin() view returns (address newAdmin, uint48 acceptSchedule)",
  "function defaultAdminDelay() view returns (uint48)",
]);

export const MAX_UINT64 = 2n ** 64n - 1n;

const ZERO_BYTES32: Hex = `0x${"00".repeat(32)}`;

/**
 * A role reference resolved to the access system it belongs to:
 * AccessControl roles are bytes32 identifiers (role names are hashed),
 * AccessManager roles are uint64 ids.
 */
export type ResolvedRole =
  | { system: "access-control"; role: Hex }
  | { system: "access-manager"; roleId: bigint };

/** AccessManager role id from a number or the ADMIN_ROLE/PUBLIC_ROLE aliases. */
export function resolveManagerRoleId(value: unknown): bigint {
  if (value === "ADMIN_ROLE") return 0n;
  if (value === "PUBLIC_ROLE") return MAX_UINT64;
  if (isNum(value)) {
    const num = value instanceof Num ? value : Num(String(value));
    if (num.isInteger() && num.num >= 0n && num.num <= MAX_UINT64) {
      return num.toBigInt();
    }
  }
  throw new ErrorException(
    `AccessManager role ids must be integers between 0 and 2^64-1 (or ADMIN_ROLE / PUBLIC_ROLE), got ${value}`,
  );
}

/**
 * Interpret a role argument: numeric values (and the ADMIN_ROLE/PUBLIC_ROLE
 * aliases) are AccessManager uint64 role ids; strings are AccessControl
 * roles — `0x…` bytes32 pass through, DEFAULT_ADMIN_ROLE is 0x00, and any
 * other name is hashed with keccak256.
 */
export function resolveRole(value: unknown): ResolvedRole {
  if (isNum(value) || value === "ADMIN_ROLE" || value === "PUBLIC_ROLE") {
    return { system: "access-manager", roleId: resolveManagerRoleId(value) };
  }
  if (typeof value === "string") {
    if (value === "DEFAULT_ADMIN_ROLE") {
      return { system: "access-control", role: ZERO_BYTES32 };
    }
    if (isHex(value)) {
      if (value.length !== 66) {
        throw new ErrorException(
          `hex roles must be 32 bytes long, got ${value}`,
        );
      }
      return { system: "access-control", role: value };
    }
    return { system: "access-control", role: keccak256(toHex(value)) };
  }
  throw new ErrorException(
    `invalid role ${value} — pass an AccessControl role name (e.g. MINTER_ROLE) or an AccessManager role id`,
  );
}
