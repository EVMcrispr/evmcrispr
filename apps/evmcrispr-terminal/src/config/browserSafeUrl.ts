// Importable from the EVML Web Worker: touches nothing but the API base.
import { setChainUrlPolicy } from "@evmcrispr/core";

import { EVMCRISPR_API_BASE } from "./api";

/**
 * Plain-http URLs (devnet RPCs, Blockscout APIs) can't be fetched from the
 * https terminal (mixed content) and wallets refuse to add networks with
 * them. Route those through the EVMcrispr CORS proxy, which allowlists
 * them per deployment; https URLs are used as declared.
 */
export function browserSafeUrl(url: string): string {
  return url.startsWith("http://")
    ? `${EVMCRISPR_API_BASE}/cors-proxy/${url}`
    : url;
}

/** Make every chain a module declares reachable from this origin — the
 *  registry hands out proxied RPC and explorer-API URLs from here on. */
export function applyBrowserUrlPolicy(): void {
  setChainUrlPolicy(browserSafeUrl);
}
