import { chainLabel, ErrorException } from "@evmcrispr/sdk";
import type {
  Category,
  CompileCtx,
  InputParam,
  Operand,
} from "@evmcrispr/sdk/onchain";
import {
  coreCall,
  encodeChain,
  encodeCond,
  encodeNav,
  encodeOrElse,
  PAYLOAD_STEP,
  rawParam,
  staticCallParam,
  toWord,
  wordOpParam,
} from "@evmcrispr/sdk/onchain";
import type { Address, Hex } from "viem";
import {
  encodeFunctionData,
  getChainContractAddress,
  labelhash,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";
import { ethRegistryMap, registryMap, requireAddress } from "./addresses";
import { V2_STATUS } from "./ethRegistry";
import { dnsName } from "./permissionedResolver";
import { registryAbi } from "./utils";

/**
 * Mainnet, or refuse.
 *
 * The plain faces resolve ENS through a dedicated mainnet client, which an
 * expression cannot do: a staticcall runs on whatever chain executes the
 * batch, and there is no way to ask mainnet from Gnosis. So an on-chain ENS
 * read is only meaningful on chain 1.
 *
 * Sepolia is refused too, even though it has a registry a staticcall could
 * reach. That is the point: the plain faces are mainnet-pinned, so a sepolia
 * registry answers about a DIFFERENT namespace — `@ens:owner(foo.eth)` and
 * `@ens:owner!(foo.eth)` would return two unrelated owners and both would
 * look right. Refusing is the only spelling that cannot silently lie.
 *
 * Previously this fell back to the mainnet registry LITERAL on any other
 * chain, which staticcalled an account with no code and surfaced as an
 * opaque revert at assertion time instead of an error at composition time.
 */
async function requireMainnet(ctx: CompileCtx, label: string): Promise<void> {
  const chainId = await ctx.module.getChainId();
  if (chainId !== 1) {
    throw new ErrorException(
      `ens: ${label} has no on-chain face on ${chainLabel(chainId)} — an assertion evaluates on the chain it runs on, and ENS cannot be read from there. Use the off-chain @ens: face, which resolves against mainnet at composition time.`,
    );
  }
}

/** The registry an on-chain face should address. */
export async function onchainRegistry(ctx: CompileCtx): Promise<Address> {
  await requireMainnet(ctx, "the registry");
  return requireAddress(registryMap, 1, "ENS");
}

/** The same rule for any other ENS address book. */
export async function onchainAddress(
  ctx: CompileCtx,
  map: Map<number, Address>,
  label: string,
): Promise<Address> {
  await requireMainnet(ctx, label);
  return requireAddress(map, 1, label);
}

/** A valid empty ABI `string`/`bytes` return: [0x20][0]. The `cond`
 *  fallback must match the winning branch's encoding, since the winning
 *  bytes pass through raw. */
export const EMPTY_DYNAMIC_RETURN: Hex = `0x${toWord(32n).slice(2)}${toWord(0n).slice(2)}`;

/**
 * The two-hop resolver read every record face shares (the `@addr!`
 * shape): `resolver(node)` on the registry, a `chain` hop into the
 * resolver with `callData`, and a `cond` that turns an unset resolver
 * into `emptyReturn` instead of a revert.
 */
export async function resolverGatedChain(
  ctx: CompileCtx,
  ensNode: Hex,
  callData: Hex,
  emptyReturn: Hex,
  cat: Category,
): Promise<Operand> {
  const registry = await onchainRegistry(ctx);
  const resolverParam = staticCallParam(
    registry,
    encodeFunctionData({
      abi: registryAbi,
      functionName: "resolver",
      args: [ensNode],
    }),
  );
  const gated = staticCallParam(
    ctx.core,
    encodeChain(resolverParam, [callData]),
  );
  return coreCall(
    ctx,
    encodeCond(
      wordOpParam(ctx, "eq", false, resolverParam, rawParam(toWord(0n))),
      rawParam(emptyReturn),
      gated,
    ),
    cat,
  );
}

/**
 * A record read through the Universal Resolver, the path every ENS client
 * takes: `resolve(dnsName, callData)` answers `(bytes result, address)`,
 * and `result` is exactly what the record call returns, so the operand
 * resolves to the same bytes a direct read of an ENS v1 resolver gave. It
 * reads ENSv2 names (whose resolvers only answer `resolve`) and ENS v1 names
 * (through their bridge) alike. A revert (no resolver, or a name only an
 * off-chain gateway answers) reads as `emptyReturn`.
 */
export async function universalResolverRead(
  ctx: CompileCtx,
  name: string,
  callData: Hex,
  emptyReturn: Hex,
  cat: Category,
): Promise<Operand> {
  await requireMainnet(ctx, "the Universal Resolver");
  const resolved = staticCallParam(
    getChainContractAddress({
      chain: mainnet,
      contract: "ensUniversalResolver",
    }),
    encodeFunctionData({
      abi: universalResolverAbi,
      functionName: "resolve",
      args: [dnsName(name), callData],
    }),
  );
  const result = staticCallParam(
    ctx.core,
    encodeNav(resolved, "(bytes,address)", [0n, PAYLOAD_STEP]),
  );
  return coreCall(ctx, encodeOrElse(result, rawParam(emptyReturn)), cat);
}

/**
 * Reads a name where it is registered when the assertion is judged: on
 * ENSv2 when its .eth ancestor is REGISTERED in the ETHRegistry, else on
 * ENS v1, as `v1` does. On ENSv2 a .eth name is read in the ETHRegistry and a
 * subname in its parent's subregistry, reached by `chain` hops through each
 * ancestor's `getSubregistry`. `read(label)` is the final call there; it
 * must return one word.
 */
export async function v2OrV1Read(
  ctx: CompileCtx,
  name: string,
  read: (label: string) => Hex,
  v1: InputParam,
  cat: Category,
): Promise<Operand> {
  const ethRegistry = await onchainAddress(ctx, ethRegistryMap, "ETHRegistry");
  // From the .eth name down.
  const labels = name.toLowerCase().split(".").slice(0, -1).reverse();
  const status = staticCallParam(
    ethRegistry,
    encodeFunctionData({
      abi: v2ReadAbi,
      functionName: "getStatus",
      args: [BigInt(labelhash(labels[0]))],
    }),
  );
  const subregistry = (label: string) =>
    encodeFunctionData({
      abi: v2ReadAbi,
      functionName: "getSubregistry",
      args: [label],
    });
  const last = labels[labels.length - 1];
  const onV2 =
    labels.length === 1
      ? staticCallParam(ethRegistry, read(last))
      : staticCallParam(
          ctx.core,
          encodeChain(staticCallParam(ethRegistry, subregistry(labels[0])), [
            ...labels.slice(1, -1).map(subregistry),
            read(last),
          ]),
        );
  return coreCall(
    ctx,
    encodeCond(
      wordOpParam(
        ctx,
        "eq",
        false,
        status,
        rawParam(toWord(BigInt(V2_STATUS.REGISTERED))),
      ),
      onV2,
      v1,
    ),
    cat,
  );
}

/** The single-word reads `v2OrV1Read` builds on, on any ENSv2 registry. */
export const v2ReadAbi = parseAbi([
  "function getStatus(uint256 anyId) view returns (uint8)",
  "function getSubregistry(string label) view returns (address)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getResolver(string label) view returns (address)",
]);

const universalResolverAbi = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes, address)",
]);
