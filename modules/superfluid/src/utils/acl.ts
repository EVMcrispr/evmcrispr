import type { Action, Module } from "@evmcrispr/sdk";
import { ErrorException, encodeAction, Num } from "@evmcrispr/sdk";
import type { Abi, Address } from "viem";
import { cfaForwarderAbi } from "../abis";
import { cfaForwarder } from "../addresses";
import { INT96_MAX } from "./rate";

// Flow operator permission bitmask (Superfluid Definitions.sol).
export const PERM_CREATE = 1;
export const PERM_UPDATE = 2;
export const PERM_DELETE = 4;
export const PERM_FULL = 7;

export function parsePermissions(value: string | undefined): number {
  if (value === undefined || value === "full") return PERM_FULL;
  let mask = 0;
  for (const part of value.split(",")) {
    switch (part.trim()) {
      case "create":
        mask |= PERM_CREATE;
        break;
      case "update":
        mask |= PERM_UPDATE;
        break;
      case "delete":
        mask |= PERM_DELETE;
        break;
      default:
        throw new ErrorException(
          `unknown permission "${part.trim()}" — use full or a comma-separated set of create,update,delete`,
        );
    }
  }
  return mask;
}

export async function getOperatorPermissions(
  module: Module,
  token: Address,
  owner: Address,
  operator: Address,
): Promise<{ permissions: number; flowrateAllowance: bigint }> {
  const client = await module.getClient();
  const chainId = await module.getChainId();
  const [permissions, flowrateAllowance] = (await client.readContract({
    address: cfaForwarder(chainId),
    abi: cfaForwarderAbi as Abi,
    functionName: "getFlowOperatorPermissions",
    args: [token, owner, operator],
  })) as [number, bigint];
  return { permissions, flowrateAllowance };
}

/**
 * Actions needed so `operator` can manage `owner`'s flows of `token` with
 * at least `permissions` and `rateAllowance` of headroom: nothing when the
 * current grant already suffices, otherwise one updateFlowOperatorPermissions
 * that merges the missing bits on top of the existing grant. `flowrateAllowance`
 * is a decrementing budget for create/update, so headroom is added to what is
 * already left rather than replacing it.
 */
export async function buildOperatorGrantActions(
  module: Module,
  token: Address,
  owner: Address,
  operator: Address,
  permissions: number,
  rateAllowance: bigint,
): Promise<Action[]> {
  const chainId = await module.getChainId();
  const current = await getOperatorPermissions(module, token, owner, operator);

  const hasPermissions = (current.permissions & permissions) === permissions;
  const hasAllowance = current.flowrateAllowance >= rateAllowance;
  if (hasPermissions && hasAllowance) return [];

  const mergedPermissions = current.permissions | permissions;
  const mergedAllowance = hasAllowance
    ? current.flowrateAllowance
    : current.flowrateAllowance + rateAllowance > INT96_MAX
      ? INT96_MAX
      : current.flowrateAllowance + rateAllowance;

  return [
    encodeAction(
      cfaForwarder(chainId),
      "updateFlowOperatorPermissions(address,address,uint8,int96)",
      [
        token,
        operator,
        Num.fromBigInt(BigInt(mergedPermissions)),
        Num.fromBigInt(mergedAllowance),
      ],
    ),
  ];
}
