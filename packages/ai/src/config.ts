/**
 * DappNode Nexus is an OpenAI-compatible AI gateway. These defaults point at
 * the public EVMcrispr terminal's registered OAuth client; a different host
 * origin (e.g. a different site embedding this package) will not be able to
 * complete the "Login with Dappnode Nexus" popup flow against it unless
 * DappNode also allow-lists that origin's redirect URI for the same client,
 * or the host passes its own `clientId`. Manually pasting a Nexus API key
 * always works regardless of the OAuth client.
 */
export interface NexusConfig {
  /** OpenAI-compatible chat completions base URL. */
  baseURL: string;
  /** OAuth2 (Authgear) token/authorize endpoint for "Login with Dappnode Nexus". */
  authEndpoint: string;
  /** Nexus control-plane API (balance, API key provisioning). */
  controlPanelURL: string;
  /** Registered OAuth2 SPA client id. */
  clientId: string;
  /** OAuth2 scope requested at login. */
  scope: string;
  /** Display name for the auto-provisioned API key. */
  apiKeyName: string;
  /** Referral promo code redeemed (best-effort) after a fresh login. */
  promoCode?: string;
  /** Chat completion model id served by Nexus. */
  model: string;
  utmSource?: string;
  utmMedium?: string;
}

export const DEFAULT_NEXUS_CONFIG: NexusConfig = {
  baseURL: "https://nexus-api.dappnode.com/v1",
  authEndpoint: "https://nexus-auth.dappnode.com",
  controlPanelURL: "https://nexus-cp.dappnode.com",
  clientId: "e4693a70faba73ba",
  scope: "openid offline_access",
  apiKeyName: "EVMcrispr",
  promoCode: "TRYNEXUS",
  model: "moonshotai/kimi-k3",
  utmSource: "evmcrispr2026-07",
  utmMedium: "referral",
};

export function resolveNexusConfig(
  overrides?: Partial<NexusConfig>,
): NexusConfig {
  return { ...DEFAULT_NEXUS_CONFIG, ...overrides };
}
