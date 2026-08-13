import { createNexusAuth, type NexusAuthOptions } from "./nexus-auth";
import { createLocalStorageChatStorage } from "./storage";

/**
 * Nexus auth broker: lets a site whose origin is NOT allow-listed on the
 * Dappnode Nexus OAuth client (e.g. assertions.eth.limo) still offer "Login
 * with Dappnode Nexus".
 *
 * A tiny page hosted on an allow-listed origin (an evmcrispr.com deploy that
 * already serves /auth/nexus/callback) renders the login button inside an
 * iframe on the embedding site. The click happens in the iframe, so the
 * whole PKCE flow — popup, callback relay, token exchange, API key
 * provisioning — runs same-origin on the allow-listed host. Only the
 * provisioned raw API key crosses to the parent, via postMessage with an
 * exact targetOrigin, and only to parents on the broker's own allow-list.
 *
 * `initNexusBroker` is called by the broker page; `NexusBrokerClient` by the
 * embedding site.
 */

/**
 * `localStorage` namespace the broker keeps its Nexus session under.
 *
 * The broker runs on the terminal's *own* origin, so with the default
 * `evmcrispr` namespace it shared one session record with the terminal app
 * itself. Since `loginWithNexus()` starts by revoking the stored session's
 * provisioned API key, logging in (or disconnecting) on either side deleted
 * the key the other side was still using. A separate namespace makes the two
 * sessions independent.
 */
export const NEXUS_BROKER_STORAGE_NAMESPACE = "evmcrispr-broker";

const MSG = {
  ready: "nexus-broker:ready",
  key: "nexus-broker:key",
  error: "nexus-broker:error",
  balance: "nexus-broker:balance",
  balanceResult: "nexus-broker:balance-result",
  logout: "nexus-broker:logout",
  logoutDone: "nexus-broker:logout-done",
} as const;

function originAllowed(origin: string, allowed: (string | RegExp)[]): boolean {
  return allowed.some((entry) =>
    typeof entry === "string" ? entry === origin : entry.test(origin),
  );
}

export interface NexusBrokerOptions {
  /** Origins allowed to embed this broker and receive keys. Exact strings
   *  or RegExps matched against the parent origin. */
  allowedOrigins: (string | RegExp)[];
  /** Button that triggers the login; the user gesture must originate inside
   *  the iframe for the OAuth popup to open. */
  loginButton: HTMLElement;
  /** Status/progress callback (e.g. to swap the button label). */
  onStatus?: (status: "idle" | "logging-in" | "done" | "error") => void;
  /** Overrides for the underlying auth client (config, storage, redirect).
   *  Storage defaults to `localStorage` under
   *  {@link NEXUS_BROKER_STORAGE_NAMESPACE} rather than the shared default,
   *  so the broker's session is not the host page's session. */
  auth?: NexusAuthOptions;
}

/**
 * Wire up the broker page. The parent origin arrives in the `parent` query
 * param (the client sets it); it is validated against `allowedOrigins` and
 * used as the exact targetOrigin for every message.
 */
export function initNexusBroker(options: NexusBrokerOptions): void {
  const { allowedOrigins, loginButton, onStatus } = options;
  const auth = createNexusAuth({
    ...options.auth,
    storage:
      options.auth?.storage ??
      createLocalStorageChatStorage(NEXUS_BROKER_STORAGE_NAMESPACE),
  });

  const parentOrigin = new URLSearchParams(window.location.search).get(
    "parent",
  );
  if (
    !parentOrigin ||
    !window.parent ||
    window.parent === window ||
    !originAllowed(parentOrigin, allowedOrigins)
  ) {
    document.body.textContent =
      "This page only works embedded by an allowed site.";
    return;
  }

  const post = (message: Record<string, unknown>) =>
    window.parent.postMessage(message, parentOrigin);

  loginButton.addEventListener("click", async () => {
    onStatus?.("logging-in");
    try {
      const key = await auth.loginWithNexus();
      post({ type: MSG.key, key });
      onStatus?.("done");
    } catch (e) {
      post({
        type: MSG.error,
        message: e instanceof Error ? e.message : String(e),
      });
      onStatus?.("error");
    }
  });

  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.origin !== parentOrigin) return;
    const data = event.data;
    if (data?.type === MSG.balance) {
      const cents = await auth.fetchNexusBalance().catch(() => null);
      post({ type: MSG.balanceResult, id: data.id, cents });
    } else if (data?.type === MSG.logout) {
      await auth.logoutNexus();
      post({ type: MSG.logoutDone, id: data.id });
    }
  });

  post({ type: MSG.ready });
}

export interface NexusBrokerClientOptions {
  /** Full URL of the broker page, e.g. "https://terminal.evmcrispr.com/auth/nexus/broker/". */
  brokerUrl: string;
  /** Called with the provisioned API key after a successful login. */
  onKey: (key: string) => void;
  /** Called when the broker reports a login failure. */
  onError?: (message: string) => void;
  /** Called when the broker iframe is loaded and ready. */
  onReady?: () => void;
}

/**
 * Parent-side handle: renders nothing itself — set `iframeSrc` as the `src`
 * of an iframe you render, and call `listen()` once it's mounted.
 */
export class NexusBrokerClient {
  readonly iframeSrc: string;
  private readonly brokerOrigin: string;
  private readonly options: NexusBrokerClientOptions;
  private iframe: HTMLIFrameElement | null = null;
  private cleanup: (() => void) | null = null;
  private pending = new Map<string, (value: unknown) => void>();

  constructor(options: NexusBrokerClientOptions) {
    this.options = options;
    const url = new URL(options.brokerUrl);
    url.searchParams.set("parent", window.location.origin);
    this.iframeSrc = url.toString();
    this.brokerOrigin = url.origin;
  }

  /** Start listening for broker messages; call with the mounted iframe. */
  listen(iframe: HTMLIFrameElement): void {
    this.iframe = iframe;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== this.brokerOrigin) return;
      const data = event.data;
      if (data?.type === MSG.ready) this.options.onReady?.();
      else if (data?.type === MSG.key && typeof data.key === "string")
        this.options.onKey(data.key);
      else if (data?.type === MSG.error)
        this.options.onError?.(String(data.message ?? "Login failed."));
      else if (
        (data?.type === MSG.balanceResult || data?.type === MSG.logoutDone) &&
        typeof data.id === "string"
      ) {
        this.pending.get(data.id)?.(data);
        this.pending.delete(data.id);
      }
    };
    window.addEventListener("message", onMessage);
    this.cleanup = () => window.removeEventListener("message", onMessage);
  }

  dispose(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.iframe = null;
    this.pending.clear();
  }

  private request<T>(type: string): Promise<T> {
    const target = this.iframe?.contentWindow;
    if (!target) return Promise.reject(new Error("Broker iframe not ready."));
    const id = crypto.randomUUID();
    return new Promise<T>((resolve) => {
      this.pending.set(id, (value) => resolve(value as T));
      target.postMessage({ type, id }, this.brokerOrigin);
    });
  }

  /** Remaining balance in euro cents via the broker's session, or null. */
  async fetchBalance(): Promise<number | null> {
    const { cents } = await this.request<{ cents: number | null }>(MSG.balance);
    return cents;
  }

  /** Revoke the broker-side session and its provisioned key. */
  async logout(): Promise<void> {
    await this.request(MSG.logout);
  }
}
