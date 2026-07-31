import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Connector } from "wagmi";

// mock.module is process-global in bun, and other suites reach wagmi
// transitively — keep every real export in place and swap only useConnect.
const actualWagmi = await import("wagmi");

let connectCalls: number;
let resolveConnect: (() => void) | undefined;
let rejectConnect: ((error: Error) => void) | undefined;

mock.module("wagmi", () => ({
  ...actualWagmi,
  useConnect: () => ({
    mutateAsync: () => {
      connectCalls += 1;
      return new Promise<void>((resolve, reject) => {
        resolveConnect = () => resolve();
        rejectConnect = reject;
      });
    },
    isPending: false,
  }),
}));

const { useWalletConnect } = await import("../../src/hooks/useWalletConnect");

const URI = "wc:topic@2?relay-protocol=irn&symKey=abc";

type Listener = (message: { type: string; data?: unknown }) => void;

function createConnector() {
  const listeners = new Set<Listener>();

  const connector = {
    id: "walletConnect",
    emitter: {
      on: (_event: string, listener: Listener) => listeners.add(listener),
      off: (_event: string, listener: Listener) => listeners.delete(listener),
    },
  } as unknown as Connector;

  return {
    connector,
    listenerCount: () => listeners.size,
    emitUri: (uri = URI) => {
      for (const listener of listeners)
        listener({ type: "display_uri", data: uri });
    },
  };
}

let navigations: string[];
let originalHref: string;
let originalHrefDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  connectCalls = 0;
  navigations = [];
  originalHref = window.location.href;
  originalHrefDescriptor = Object.getOwnPropertyDescriptor(
    window.location,
    "href",
  );
  Object.defineProperty(window.location, "href", {
    configurable: true,
    get: () => originalHref,
    set: (value: string) => navigations.push(value),
  });
});

afterEach(() => {
  // Restore the real accessor rather than leaving a plain value behind, or
  // navigation stays broken for every later test in this bun process.
  if (originalHrefDescriptor) {
    Object.defineProperty(window.location, "href", originalHrefDescriptor);
  } else {
    delete (window.location as { href?: string }).href;
  }
});

describe("useWalletConnect", () => {
  test("deep-links into the wallet app as soon as the pairing URI arrives", async () => {
    const fake = createConnector();
    const onConnect = mock(() => {});
    const { result } = renderHook(() =>
      useWalletConnect({
        walletConnectConnector: fake.connector,
        onConnect,
      }),
    );

    act(() => {
      result.current.startConnection(
        (uri) => `metamask://wc?uri=${encodeURIComponent(uri)}`,
      );
    });

    await waitFor(() => expect(connectCalls).toBe(1));
    // The URI is emitted right after the pairing is created; if the hook
    // subscribed after connecting, this event would be missed entirely.
    act(() => fake.emitUri());

    expect(navigations).toEqual([
      `metamask://wc?uri=${encodeURIComponent(URI)}`,
    ]);
    await waitFor(() => expect(result.current.wcUri).toBe(URI));
    expect(result.current.canReopenWallet).toBe(true);

    // The QR stays on screen until the wallet app approves the session.
    expect(onConnect).not.toHaveBeenCalled();
    await act(async () => {
      resolveConnect?.();
    });
    await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));
    expect(fake.listenerCount()).toBe(0);
  });

  test("shows the QR without navigating when no wallet was picked", async () => {
    const fake = createConnector();
    const { result } = renderHook(() =>
      useWalletConnect({
        walletConnectConnector: fake.connector,
        onConnect: () => {},
      }),
    );

    act(() => {
      result.current.startConnection();
    });
    await waitFor(() => expect(connectCalls).toBe(1));
    act(() => fake.emitUri());

    await waitFor(() => expect(result.current.wcUri).toBe(URI));
    expect(navigations).toEqual([]);
    expect(result.current.canReopenWallet).toBe(false);
  });

  test("reopens the wallet app on demand", async () => {
    const fake = createConnector();
    const { result } = renderHook(() =>
      useWalletConnect({
        walletConnectConnector: fake.connector,
        onConnect: () => {},
      }),
    );

    act(() => {
      result.current.startConnection((uri) => `metamask://wc?uri=${uri}`);
    });
    await waitFor(() => expect(connectCalls).toBe(1));
    act(() => fake.emitUri());
    await waitFor(() => expect(result.current.canReopenWallet).toBe(true));

    act(() => result.current.reopenWallet());
    // Same pairing URI reused — a second navigation, not a second pairing.
    expect(navigations).toEqual([
      `metamask://wc?uri=${URI}`,
      `metamask://wc?uri=${URI}`,
    ]);
    expect(connectCalls).toBe(1);
  });

  test("surfaces a rejected session instead of closing the modal", async () => {
    const fake = createConnector();
    const onConnect = mock(() => {});
    const { result } = renderHook(() =>
      useWalletConnect({
        walletConnectConnector: fake.connector,
        onConnect,
      }),
    );

    act(() => {
      result.current.startConnection();
    });
    await waitFor(() => expect(connectCalls).toBe(1));
    act(() => fake.emitUri());

    await act(async () => {
      rejectConnect?.(new Error("User rejected"));
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe("User rejected"),
    );
    expect(onConnect).not.toHaveBeenCalled();
    // The URI survives so the user can retry from the same screen.
    expect(result.current.wcUri).toBe(URI);
    expect(fake.listenerCount()).toBe(0);
  });
});
