import type { Action, Address, Param } from "@evmcrispr/sdk";
import { ErrorException, encodeAction } from "@evmcrispr/sdk";
import { isRuntimeValue } from "@evmcrispr/sdk/onchain";
import { isAddressEqual, parseAbi, zeroAddress } from "viem";
import type Safe from "..";
import {
  MODULE_GUARD_INTERFACE_ID,
  TRANSACTION_GUARD_INTERFACE_ID,
} from "../addresses";
import { getSafeVersion } from "./reads";

const erc165Abi = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

const supportsModuleGuards = (version: string): boolean => {
  const [major, minor] = version.split(".").map(Number);
  return major > 1 || (major === 1 && minor >= 5);
};

/**
 * The setGuard/setModuleGuard call for `safe:set-guard` and
 * `safe:remove-guard`, checked while the script is built so a bad call fails
 * here rather than as a bare GS300/GS301 revert or, for module guards on a
 * Safe below v1.5.0, a call that falls through to the fallback handler.
 */
export async function encodeGuardChange(
  module: Safe,
  commandName: string,
  guard: Param,
  moduleGuard: boolean,
): Promise<Action> {
  const safe = await module.resolveSafe();
  const client = await module.getClient();
  const kind = moduleGuard ? "module guard" : "transaction guard";

  if (moduleGuard) {
    let version: string;
    try {
      version = await getSafeVersion(client, safe);
    } catch {
      throw new ErrorException(
        `${safe} does not look like a Safe contract (no VERSION())`,
      );
    }
    if (!supportsModuleGuards(version)) {
      if (!module.upgradePending(safe))
        throw new ErrorException(
          `${commandName} --module needs Safe v1.5.0 or later, and ${safe} is v${version}. Upgrade it first with safe:upgrade in the same block.`,
        );
      module.context.log(
        `Safe ${safe} is v${version} on chain; the safe:upgrade earlier in this block moves it to v1.5.0 before the ${kind} is set`,
      );
    }
  }

  // A runtime guard is only known on chain; the zero address removes.
  if (
    !isRuntimeValue(guard) &&
    !isAddressEqual(guard as Address, zeroAddress)
  ) {
    const address = guard as Address;
    const interfaceId = moduleGuard
      ? MODULE_GUARD_INTERFACE_ID
      : TRANSACTION_GUARD_INTERFACE_ID;
    if (!(await client.getCode({ address }))) {
      // Possibly deployed by an earlier action in the same block.
      module.context.log(
        `${address} has no code yet, so ${commandName} cannot check that it is a ${kind} (interface ${interfaceId})`,
      );
    } else {
      const supports = (id: `0x${string}`) =>
        client
          .readContract({
            address,
            abi: erc165Abi,
            functionName: "supportsInterface",
            args: [id],
          })
          .catch(() => false);
      if (!(await supports(interfaceId))) {
        const hint =
          !moduleGuard && (await supports(MODULE_GUARD_INTERFACE_ID))
            ? " It is a module guard: pass --module."
            : "";
        throw new ErrorException(
          `${address} is not a ${kind}: it does not report interface ${interfaceId} through supportsInterface, so the Safe would refuse it (${moduleGuard ? "GS301" : "GS300"}).${hint}`,
        );
      }
    }
  }

  return encodeAction(
    safe,
    moduleGuard ? "setModuleGuard(address)" : "setGuard(address)",
    [guard],
  );
}
