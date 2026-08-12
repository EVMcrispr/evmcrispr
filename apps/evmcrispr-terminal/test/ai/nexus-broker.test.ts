import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createLocalStorageChatStorage,
  initNexusBroker,
  NEXUS_BROKER_STORAGE_NAMESPACE,
  type NexusAuth,
} from "@evmcrispr/ai";

const HOST_AUTH: NexusAuth = {
  access_token: "host-access",
  refresh_token: "host-refresh",
  expires_at: Date.now() + 3_600_000,
  key_id: "host-key-id",
};

const BROKER_AUTH: NexusAuth = {
  access_token: "broker-access",
  refresh_token: "broker-refresh",
  expires_at: Date.now() + 3_600_000,
  key_id: "broker-key-id",
};

beforeEach(() => {
  localStorage.clear();
});

describe("broker storage namespace", () => {
  test("is not the default host namespace", () => {
    expect(NEXUS_BROKER_STORAGE_NAMESPACE).not.toBe("evmcrispr");
  });

  test("broker and host storages do not collide", () => {
    const host = createLocalStorageChatStorage();
    const broker = createLocalStorageChatStorage(
      NEXUS_BROKER_STORAGE_NAMESPACE,
    );

    host.saveApiKey("host-key");
    host.saveAuth(HOST_AUTH);
    broker.saveApiKey("broker-key");
    broker.saveAuth(BROKER_AUTH);

    expect(host.getApiKey()).toBe("host-key");
    expect(broker.getApiKey()).toBe("broker-key");

    // Whatever either side does to its own session, the other survives.
    broker.clearApiKey();
    broker.clearAuth();

    expect(host.getApiKey()).toBe("host-key");
    expect(host.getAuth()).toEqual(HOST_AUTH);
    expect(broker.getApiKey()).toBeNull();
    expect(broker.getAuth()).toBeNull();
  });
});

/** happy-dom starts on `about:blank`; the broker needs a real origin and the
 *  `parent` query param the embedding client sets. */
function setUrl(url: string): void {
  (
    globalThis as { happyDOM?: { setURL?: (url: string) => void } }
  ).happyDOM?.setURL?.(url);
}

describe("initNexusBroker", () => {
  const parentOrigin = "https://assertions.eth.limo";
  const realFetch = globalThis.fetch;
  const realHref = window.location.href;
  const realParent = Object.getOwnPropertyDescriptor(window, "parent");
  let requests: { url: string; method: string }[] = [];
  let posted: unknown[] = [];

  beforeEach(() => {
    requests = [];
    posted = [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
      });
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    // The broker refuses to run outside an iframe; stand in for the embedder.
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: {
        postMessage: (message: unknown) => {
          posted.push(message);
        },
      },
    });
    setUrl(
      `https://terminal.evmcrispr.com/auth/nexus/broker/?parent=${encodeURIComponent(parentOrigin)}`,
    );
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realParent) Object.defineProperty(window, "parent", realParent);
    else Reflect.deleteProperty(window, "parent");
    setUrl(realHref);
  });

  test("logs out its own session without touching the host's", async () => {
    const host = createLocalStorageChatStorage();
    host.saveApiKey("host-key");
    host.saveAuth(HOST_AUTH);
    createLocalStorageChatStorage(NEXUS_BROKER_STORAGE_NAMESPACE).saveAuth(
      BROKER_AUTH,
    );

    const button = document.createElement("button");
    document.body.appendChild(button);
    initNexusBroker({
      allowedOrigins: [parentOrigin],
      loginButton: button,
    });

    expect(posted).toEqual([{ type: "nexus-broker:ready" }]);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: parentOrigin,
        data: { type: "nexus-broker:logout", id: "req-1" },
      }),
    );
    // The listener is async: let the logout fetches and storage writes settle.
    await Bun.sleep(0);

    expect(posted).toContainEqual({
      type: "nexus-broker:logout-done",
      id: "req-1",
    });
    // The revoked key is the broker's, never the host's.
    const deletes = requests.filter((r) => r.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toEndWith("/user/apikeys/broker-key-id");
    expect(requests.some((r) => r.url.includes("host-key-id"))).toBe(false);

    // Host session and its provisioned key are untouched.
    expect(host.getApiKey()).toBe("host-key");
    expect(host.getAuth()).toEqual(HOST_AUTH);
    // The broker's own session is gone.
    expect(
      createLocalStorageChatStorage(NEXUS_BROKER_STORAGE_NAMESPACE).getAuth(),
    ).toBeNull();
  });
});
