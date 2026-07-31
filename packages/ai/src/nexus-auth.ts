import { type NexusConfig, resolveNexusConfig } from "./config";
import {
  type ChatStorage,
  createLocalStorageChatStorage,
  type NexusAuth,
} from "./storage";

// "Login with Dappnode Nexus": authorization code + PKCE against Dappnode's
// Authgear in a popup, then auto-provision a Nexus API key with the resulting
// access token. The chat itself only ever sees the provisioned key.

const CALLBACK_MESSAGE_TYPE = "nexus-auth-callback";
// Access tokens are refreshed this many ms before their expiry.
const EXPIRY_SLACK_MS = 60_000;

export interface NexusAuthOptions {
  config?: Partial<NexusConfig>;
  storage?: ChatStorage;
  /** Path (from the current origin) the OAuth popup redirects back to.
   *  The host must serve a page there that relays `code`/`state`/`error`
   *  query params to `window.opener` as a `nexus-auth-callback` message
   *  (a static HTML page is enough — see the terminal app's
   *  `public/auth/nexus/callback/index.html` for a reference). */
  redirectPath?: string;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function waitForCallback(
  popup: Window,
  state: string,
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(closedPoll);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type !== CALLBACK_MESSAGE_TYPE || data.state !== state) return;
      cleanup();
      if (data.code) resolve({ code: data.code });
      else
        reject(
          new Error(data.error_description ?? data.error ?? "Login failed."),
        );
    };
    const closedPoll = setInterval(() => {
      if (popup.closed) {
        // Give a just-delivered message a beat to win the race.
        setTimeout(() => {
          cleanup();
          reject(new Error("Login window was closed."));
        }, 500);
      }
    }, 500);
    window.addEventListener("message", onMessage);
  });
}

/**
 * Creates a Nexus auth client bound to a config/storage pair. Most hosts
 * should just use the module-level functions below (which use the default
 * config and `localStorage`); pass options only to point at a different
 * OAuth client or plug in different persistence.
 */
export function createNexusAuth(options: NexusAuthOptions = {}) {
  const config = resolveNexusConfig(options.config);
  const storage = options.storage ?? createLocalStorageChatStorage();
  const redirectPath = options.redirectPath ?? "/auth/nexus/callback";

  function redirectUri(): string {
    return `${window.location.origin}${redirectPath}`;
  }

  async function fetchTokens(body: Record<string, string>): Promise<NexusAuth> {
    const res = await fetch(`${config.authEndpoint}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, ...body }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(
        err?.error_description ??
          err?.error ??
          `Token request failed (${res.status})`,
      );
    }
    const tokens: TokenResponse = await res.json();
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? body.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
      key_id: storage.getAuth()?.key_id ?? "",
    };
  }

  /** Returns a valid access token for the stored session, refreshing if needed. */
  async function getFreshAccessToken(): Promise<string | null> {
    const auth = storage.getAuth();
    if (!auth) return null;
    if (Date.now() < auth.expires_at - EXPIRY_SLACK_MS)
      return auth.access_token;
    const refreshed = await fetchTokens({
      grant_type: "refresh_token",
      refresh_token: auth.refresh_token,
    });
    storage.saveAuth(refreshed);
    return refreshed.access_token;
  }

  /**
   * Remaining chat balance in euro cents (monthly plan remainder + prepaid
   * credit), or null when there is no Nexus session (e.g. manually pasted key)
   * or the balance can't be fetched.
   */
  async function fetchNexusBalance(): Promise<number | null> {
    const accessToken = await getFreshAccessToken().catch(() => null);
    if (!accessToken) return null;
    const res = await fetch(`${config.controlPanelURL}/user/balance`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);
    if (!res?.ok) return null;
    const balance = await res.json();
    const monthlyLeft = Math.max(
      0,
      (balance.monthly_credit_total_cents ?? 0) -
        (balance.monthly_credit_used_cents ?? 0),
    );
    return monthlyLeft + (balance.prepaid_credit_cents ?? 0);
  }

  /**
   * If this page load is the OAuth popup callback, relay the result to the
   * opener and return true (the caller should skip mounting the app). Use
   * this as a fallback for hosts that rewrite unknown paths to the SPA; a
   * static page at `redirectPath` handles the common case without it.
   */
  function relayNexusCallback(): boolean {
    if (window.location.pathname.replace(/\/$/, "") !== redirectPath)
      return false;
    const params = new URLSearchParams(window.location.search);
    if (window.opener) {
      window.opener.postMessage(
        {
          type: CALLBACK_MESSAGE_TYPE,
          code: params.get("code"),
          state: params.get("state"),
          error: params.get("error"),
          error_description: params.get("error_description"),
        },
        window.location.origin,
      );
      document.body.textContent = "Login complete — you can close this window.";
      window.close();
    } else {
      document.body.textContent =
        "This window was opened outside the login flow.";
    }
    return true;
  }

  /**
   * Runs the full login flow: popup login on Dappnode's Authgear, code
   * exchange, and API key provisioning. Resolves with the raw API key.
   */
  async function loginWithNexus(): Promise<string> {
    // Replacing an existing session: revoke it and its key first so we don't
    // accumulate orphan provisioned keys on the user's Nexus account.
    await logoutNexus();

    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

    const url = new URL(`${config.authEndpoint}/oauth2/authorize`);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scope);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    if (config.utmSource) url.searchParams.set("utm_source", config.utmSource);
    if (config.utmMedium) url.searchParams.set("utm_medium", config.utmMedium);

    const popup = window.open(url, "nexus-login", "popup,width=480,height=720");
    if (!popup) throw new Error("Popup blocked — allow popups for this site.");

    let code: string;
    try {
      ({ code } = await waitForCallback(popup, state));
    } finally {
      if (!popup.closed) popup.close();
    }

    const auth = await fetchTokens({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    });

    // Best-effort: credits the referral promo to fresh accounts; fails
    // harmlessly for accounts that already redeemed it (one-use-per-account).
    if (config.promoCode) {
      await fetch(`${config.controlPanelURL}/user/promo/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({ code: config.promoCode }),
      }).catch(() => {});
    }

    const keyRes = await fetch(`${config.controlPanelURL}/user/apikeys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.access_token}`,
      },
      body: JSON.stringify({ name: config.apiKeyName, pii_mode: "balanced" }),
    });
    if (!keyRes.ok)
      throw new Error(`Could not create a Nexus API key (${keyRes.status}).`);
    const key: { id: string; raw_key: string } = await keyRes.json();

    storage.saveAuth({ ...auth, key_id: key.id });
    return key.raw_key;
  }

  /**
   * Best-effort logout: delete the provisioned API key, revoke the refresh
   * token, and drop the stored session. Never throws.
   */
  async function logoutNexus(): Promise<void> {
    const auth = storage.getAuth();
    if (!auth) return;
    try {
      if (auth.key_id) {
        const accessToken =
          (await getFreshAccessToken().catch(() => null)) ?? auth.access_token;
        await fetch(`${config.controlPanelURL}/user/apikeys/${auth.key_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      await fetch(`${config.authEndpoint}/oauth2/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          token: auth.refresh_token,
        }),
      });
    } catch {
      // Remote cleanup is best-effort.
    } finally {
      storage.clearAuth();
    }
  }

  return {
    fetchNexusBalance,
    relayNexusCallback,
    loginWithNexus,
    logoutNexus,
  };
}

const defaultAuth = createNexusAuth();

export const fetchNexusBalance = defaultAuth.fetchNexusBalance;
export const relayNexusCallback = defaultAuth.relayNexusCallback;
export const loginWithNexus = defaultAuth.loginWithNexus;
export const logoutNexus = defaultAuth.logoutNexus;
