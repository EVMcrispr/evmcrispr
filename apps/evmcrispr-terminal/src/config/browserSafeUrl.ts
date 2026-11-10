// Importable from the EVML Web Worker: touches nothing but the API base.
import { setChainUrlPolicy, setEtherscanProxy } from "@evmcrispr/core";

import { EVMCRISPR_API_BASE } from "./api";

/** The user's own machine: browsers allow plain http to it from https pages. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Plain-http URLs (devnet RPCs, Blockscout APIs) can't be fetched from the
 * https terminal (mixed content) and wallets refuse to add networks with
 * them. Route those through the EVMcrispr CORS proxy, which allowlists
 * them per deployment; https URLs are used as declared. A loopback URL is
 * never proxied: it names the user's machine, and the proxy would reach
 * its own.
 */
export function browserSafeUrl(url: string): string {
  if (!url.startsWith("http://")) return url;
  if (LOOPBACK.has(new URL(url).hostname)) return url;
  return `${EVMCRISPR_API_BASE}/cors-proxy/${url}`;
}

/** Make every chain a module declares reachable from this origin — the
 *  registry hands out proxied RPC and explorer-API URLs from here on — and
 *  send Etherscan requests through the API, which holds the key: none is
 *  compiled into this app. */
export function applyBrowserUrlPolicy(): void {
  setChainUrlPolicy(browserSafeUrl);
  setEtherscanProxy(`${EVMCRISPR_API_BASE}/etherscan`);
}
