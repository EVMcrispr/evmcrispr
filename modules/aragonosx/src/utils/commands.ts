import type { Address } from "@evmcrispr/sdk";
import { getAddress, isAddress } from "viem";
import type AragonOSx from "..";

/**
 * Resolve a permission target (`where`): a raw address, the literal `dao`
 * for the connected DAO, or a plugin identifier.
 */
export function resolveTarget(
  module: AragonOSx,
  where: string,
  commandName: string,
): Address {
  if (isAddress(where)) return getAddress(where);
  if (where === "dao") {
    return module.requireCurrentDAO(commandName).address;
  }
  const { plugin } = module.resolvePlugin(where, commandName);
  return plugin.address;
}
