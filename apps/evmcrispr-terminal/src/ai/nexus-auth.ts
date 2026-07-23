import {
  clearNexusAuth,
  getNexusAuth,
  type NexusAuth,
  saveNexusAuth,
} from "../utils";

// "Login with Dappnode Nexus": authorization code + PKCE against Dappnode's
// Authgear in a popup, then auto-provision a Nexus API key with the resulting
// access token. The chat itself only ever sees the provisioned key.

const NEXUS_AUTH_ENDPOINT = "https://nexus-auth.dappnode.com";
const NEXUS_CP_URL = "https://nexus-cp.dappnode.com";
// Public SPA client registered by Dappnode for evmcrispr.com origins.
const NEXUS_CLIENT_ID = "e4693a70faba73ba";
const SCOPE = "openid offline_access";
const API_KEY_NAME = "EVMcrispr";
const PROMO_CODE = "TRYNEXUS";

const CALLBACK_MESSAGE_TYPE = "nexus-auth-callback";
// Access tokens are refreshed this many ms before their expiry.
const EXPIRY_SLACK_MS = 60_000;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function redirectUri(): string {
  return `${window.location.origin}/auth/nexus/callback`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function fetchTokens(body: Record<string, string>): Promise<NexusAuth> {
  const res = await fetch(`${NEXUS_AUTH_ENDPOINT}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: NEXUS_CLIENT_ID, ...body }),
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
    key_id: getNexusAuth()?.key_id ?? "",
  };
}

/** Returns a valid access token for the stored session, refreshing if needed. */
async function getFreshAccessToken(): Promise<string | null> {
  const auth = getNexusAuth();
  if (!auth) return null;
  if (Date.now() < auth.expires_at - EXPIRY_SLACK_MS) return auth.access_token;
  const refreshed = await fetchTokens({
    grant_type: "refresh_token",
    refresh_token: auth.refresh_token,
  });
  saveNexusAuth(refreshed);
  return refreshed.access_token;
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
 * Remaining chat balance in euro cents (monthly plan remainder + prepaid
 * credit), or null when there is no Nexus session (e.g. manually pasted key)
 * or the balance can't be fetched.
 */
export async function fetchNexusBalance(): Promise<number | null> {
  const accessToken = await getFreshAccessToken().catch(() => null);
  if (!accessToken) return null;
  const res = await fetch(`${NEXUS_CP_URL}/user/balance`, {
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
 * opener and return true (the caller should skip mounting the app). Normally
 * the static public/auth/nexus/callback page handles this, but a host that
 * rewrites unknown paths to the SPA serves the app there instead.
 */
export function relayNexusCallback(): boolean {
  if (window.location.pathname.replace(/\/$/, "") !== "/auth/nexus/callback")
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
export async function loginWithNexus(): Promise<string> {
  // Replacing an existing session: revoke it and its key first so we don't
  // accumulate orphan "EVMcrispr" keys on the user's Nexus account.
  await logoutNexus();

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  const url = new URL(`${NEXUS_AUTH_ENDPOINT}/oauth2/authorize`);
  url.searchParams.set("client_id", NEXUS_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  // Referral attribution; the promo itself is redeemed after login below.
  url.searchParams.set("utm_source", "evmcrispr2026-07");
  url.searchParams.set("utm_medium", "referral");

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
  await fetch(`${NEXUS_CP_URL}/user/promo/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.access_token}`,
    },
    body: JSON.stringify({ code: PROMO_CODE }),
  }).catch(() => {});

  const keyRes = await fetch(`${NEXUS_CP_URL}/user/apikeys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.access_token}`,
    },
    body: JSON.stringify({ name: API_KEY_NAME, pii_mode: "balanced" }),
  });
  if (!keyRes.ok)
    throw new Error(`Could not create a Nexus API key (${keyRes.status}).`);
  const key: { id: string; raw_key: string } = await keyRes.json();

  saveNexusAuth({ ...auth, key_id: key.id });
  return key.raw_key;
}

/**
 * Best-effort logout: delete the provisioned API key, revoke the refresh
 * token, and drop the stored session. Never throws.
 */
export async function logoutNexus(): Promise<void> {
  const auth = getNexusAuth();
  if (!auth) return;
  try {
    if (auth.key_id) {
      const accessToken =
        (await getFreshAccessToken().catch(() => null)) ?? auth.access_token;
      await fetch(`${NEXUS_CP_URL}/user/apikeys/${auth.key_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
    await fetch(`${NEXUS_AUTH_ENDPOINT}/oauth2/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: NEXUS_CLIENT_ID,
        token: auth.refresh_token,
      }),
    });
  } catch {
    // Remote cleanup is best-effort.
  } finally {
    clearNexusAuth();
  }
}
