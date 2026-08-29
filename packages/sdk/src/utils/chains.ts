import type { Chain, Transport } from "viem";
import { defineChain, http } from "viem";
import * as viemChains from "viem/chains";
import type { ChainDef } from "./schema";

/**
 * Chains declared by modules (`src/chains.ts`) or registered by a host.
 * Consulted before viem's own list so a module can ship a network viem
 * doesn't know about (devnets, app-chains) without touching the sdk.
 */
const registry = new Map<number, ChainDef>();

/**
 * How the host reaches the URLs modules declare. A browser page served
 * over https can't fetch a plain-http devnet RPC or explorer API (mixed
 * content), so the terminal routes those through its CORS proxy; the
 * policy is applied on every lookup so modules keep declaring the real
 * URLs. `explorerUrl` is left alone: it's a link for people, not fetch.
 */
let urlPolicy: ((url: string) => string) | undefined;

export function setChainUrlPolicy(
  policy: ((url: string) => string) | undefined,
): void {
  urlPolicy = policy;
}

function withPolicy(def: ChainDef): ChainDef {
  if (!urlPolicy) return def;
  return {
    ...def,
    rpcUrl: urlPolicy(def.rpcUrl),
    ...(def.explorerApiUrl
      ? { explorerApiUrl: urlPolicy(def.explorerApiUrl) }
      : {}),
  };
}

function lookup(chainId: number): ChainDef | undefined {
  const def = registry.get(chainId);
  return def && withPolicy(def);
}

/** Build a viem `Chain` from a literal declaration. */
export function toViemChain(def: ChainDef): Chain {
  return defineChain({
    id: def.id,
    name: def.name,
    nativeCurrency: def.nativeCurrency ?? {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: { default: { http: [def.rpcUrl] } },
    ...(def.explorerUrl
      ? {
          blockExplorers: {
            default: { name: "Explorer", url: def.explorerUrl },
          },
        }
      : {}),
    ...(def.testnet ? { testnet: true } : {}),
  });
}

/** Register chain declarations. Later registrations of the same id win.
 *  A declaration with an explorer but no explorer API gets Blockscout's
 *  conventional `<explorerUrl>/api`. */
export function registerChains(...defs: ChainDef[]): void {
  for (const def of defs) {
    const explorerApiUrl =
      def.explorerApiUrl ??
      (def.explorerUrl
        ? `${def.explorerUrl.replace(/\/$/, "")}/api`
        : undefined);
    registry.set(def.id, explorerApiUrl ? { ...def, explorerApiUrl } : def);
  }
}

/** Declaration registered for a chain id, if any, with the host's URL
 *  policy applied. */
export function registeredChain(chainId: number): ChainDef | undefined {
  return lookup(chainId);
}

/** Every registered declaration, in registration order. */
export function registeredChains(): ChainDef[] {
  return [...registry.keys()].map((id) => lookup(id) as ChainDef);
}

/** Look up the `Chain` object for a chain id: registered declarations
 *  first, then viem's own list. */
export function viemChainById(chainId: number | undefined): Chain | undefined {
  if (!chainId) return undefined;
  const registered = lookup(chainId);
  if (registered) return toViemChain(registered);
  return Object.values(viemChains).find(
    (c) => c && typeof c === "object" && (c as Chain).id === chainId,
  ) as Chain | undefined;
}

/** URL behind an `http()` transport, when it carries one. */
export function transportUrl(transport?: Transport): string | undefined {
  if (!transport) return undefined;
  try {
    const t = transport({});
    if (t.config.type !== "http") return undefined;
    return (t.value as { url?: string } | undefined)?.url;
  } catch {
    // `http()` without a URL needs a chain to resolve one — nothing to report.
    return undefined;
  }
}

/** A placeholder `Chain` for an id nobody declared. */
export function synthesizeChain(chainId: number, rpcUrl?: string): Chain {
  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: rpcUrl ? [rpcUrl] : [] } },
  });
}

/**
 * The chain to use for an id: a known chain (registered or viem), else a
 * synthesized one when the host configured a transport for it. Undefined
 * when neither exists — the caller has no way to reach that chain.
 */
export function resolveChain(
  chainId: number,
  transport?: Transport,
): Chain | undefined {
  const registered = lookup(chainId);
  if (registered) {
    // The host's transport wins over the declared RPC (e.g. a browser
    // routing a plain-http devnet through an https proxy): wallets are
    // handed the URL the host itself uses.
    const url = transportUrl(transport);
    return toViemChain(url ? { ...registered, rpcUrl: url } : registered);
  }
  return (
    viemChainById(chainId) ??
    (transport ? synthesizeChain(chainId, transportUrl(transport)) : undefined)
  );
}

/** Transport for a registered chain's declared RPC, if the id is registered. */
export function defaultTransport(chainId: number): Transport | undefined {
  const def = lookup(chainId);
  return def ? http(def.rpcUrl) : undefined;
}
