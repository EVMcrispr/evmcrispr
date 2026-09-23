import type { Address, NodesInterpreters } from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { SmartBatchPlan } from "@evmcrispr/sdk/onchain";
import { isAddressEqual, type PublicClient } from "viem";
import type Safe from "..";
import { getOwners, getSafeVersion, getThreshold } from "./reads";
import { logSafeSignable, requestSafeSignature } from "./sign";
import {
  kindLabel,
  mergeSafeSignables,
  messageSignable,
  nestedPayload,
  type SafeSignable,
  type SafeSignature,
  usesHashEip1271,
} from "./signables";

/** Owner Safes are followed this many levels deep. */
export const MAX_OWNER_SAFE_DEPTH = 3;

const safeVersionOf = async (
  client: PublicClient,
  address: Address,
): Promise<string | undefined> => {
  try {
    const code = await client.getCode({ address });
    if (!code || code === "0x") return undefined;
    return await getSafeVersion(client, address);
  } catch {
    return undefined;
  }
};

/** How `account` owns `safe`: `[safe]` for a direct owner, or
 *  `[safe, B, …]` when it owns owner Safe B (up to 3 levels deep). A direct
 *  owner wins; among several owner Safes, `via` picks the first one. */
export async function resolveOwnerPath(
  module: Safe,
  safe: Address,
  account: Address,
  via?: Address,
): Promise<Address[]> {
  const client = await module.getClient();
  const owners = await getOwners(client, safe);
  if (!via && owners.some((o) => isAddressEqual(o, account))) return [safe];
  let frontier: Address[][] = [[safe]];
  const visited = new Set([safe.toLowerCase()]);
  for (let depth = 1; depth <= MAX_OWNER_SAFE_DEPTH; depth++) {
    const next: Address[][] = [];
    const found: Address[][] = [];
    for (const path of frontier) {
      const parentOwners = await getOwners(client, path.at(-1)!);
      for (const owner of parentOwners) {
        if (visited.has(owner.toLowerCase())) continue;
        if (depth === 1 && via && !isAddressEqual(owner, via)) continue;
        if (!(await safeVersionOf(client, owner))) continue;
        visited.add(owner.toLowerCase());
        const candidate = [...path, owner];
        if (
          (await getOwners(client, owner)).some((o) =>
            isAddressEqual(o, account),
          )
        )
          found.push(candidate);
        else next.push(candidate);
      }
    }
    if (found.length === 1) return found[0];
    if (found.length > 1)
      throw new ErrorException(
        `${account} owns Safe ${safe} through several owner Safes; pick one with --via:\n${found.map((p) => `  ${p.slice(1).join(" → ")}`).join("\n")}`,
      );
    frontier = next;
  }
  throw new ErrorException(
    via
      ? `${account} does not own Safe ${safe} through owner Safe ${via}`
      : `${account} is not an owner of Safe ${safe}, directly or through owner Safes (up to ${MAX_OWNER_SAFE_DEPTH} levels)`,
  );
}

/** Whether the connected account's signature alone completes every owner
 *  Safe along `path` (all their thresholds are 1). */
export async function signsAlone(
  client: PublicClient,
  path: Address[],
): Promise<boolean> {
  for (const safe of path.slice(1))
    if ((await getThreshold(client, safe)) !== 1n) return false;
  return true;
}

/** The connected wallet's signature slot for `signable` (at `path[0]`),
 *  through the owner Safes of `path`: an EIP-712 signature for a direct
 *  owner, otherwise a contract signature of `path[1]` collecting the
 *  signatures of its own owners, recursively. */
export async function signThrough(
  module: Safe,
  interpreters: NodesInterpreters,
  signable: SafeSignable,
  path: Address[],
  commandName: string,
  executionPlan?: SmartBatchPlan,
): Promise<{ owner: Address; signature: SafeSignature }> {
  if (path.length === 1) {
    const { owner, signature } = await requestSafeSignature(
      module,
      interpreters,
      signable,
      commandName,
      executionPlan,
    );
    return { owner, signature };
  }
  const client = await module.getClient();
  const [safe, ownerSafe] = path;
  const [version, ownerVersion] = await Promise.all([
    getSafeVersion(client, safe),
    getSafeVersion(client, ownerSafe),
  ]);
  // A Safe below 1.5.0 asks its owner Safes through the legacy
  // isValidSignature(bytes,bytes), which 1.5.0 fallback handlers dropped.
  if (!usesHashEip1271(version) && usesHashEip1271(ownerVersion))
    throw new ErrorException(
      `owner Safe ${ownerSafe} (Safe ${ownerVersion}) cannot sign for Safe ${safe} (Safe ${version}) off-chain: its fallback handler lacks the legacy EIP-1271 check; confirm on-chain with safe:confirm-onchain instead`,
    );
  const message = nestedPayload(signable, version);
  const inner = messageSignable(signable.chainId, ownerSafe, message);
  module.context.log(
    `Signing as owner of Safe ${safe} through owner Safe ${ownerSafe}:`,
  );
  logSafeSignable(module, inner);
  const { signature } = await signThrough(
    module,
    interpreters,
    inner,
    path.slice(1),
    commandName,
    executionPlan,
  );
  return {
    owner: ownerSafe,
    signature: {
      type: "contract",
      owner: ownerSafe,
      message,
      signatures: [signature],
    },
  };
}

/** Sign as an owner of the Safe — directly or through owner Safes — and
 *  return the Safe transaction or Safe message with the signature added. */
export async function walletSignSafeSignable(
  module: Safe,
  interpreters: NodesInterpreters,
  signable: SafeSignable,
  commandName: string,
  {
    via,
    executionPlan,
  }: { via?: Address; executionPlan?: SmartBatchPlan } = {},
): Promise<SafeSignable> {
  if (interpreters.simulation)
    throw new ErrorException(
      `${commandName} cannot request wallet signatures during simulation; use safe:propose-offline for an unsigned ${kindLabel(signable)}`,
    );
  const path = await resolveOwnerPath(
    module,
    signable.safe,
    await module.getConnectedAccount(true),
    via,
  );
  const { signature } = await signThrough(
    module,
    interpreters,
    signable,
    path,
    commandName,
    executionPlan,
  );
  return mergeSafeSignables(signable, [signature]);
}
