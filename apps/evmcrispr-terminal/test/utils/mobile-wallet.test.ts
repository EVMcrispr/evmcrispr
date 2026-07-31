import { afterEach, describe, expect, test } from "bun:test";

import {
  hasInjectedProvider,
  isMobileDevice,
  MOBILE_WALLETS,
} from "../../src/utils/mobile-wallet";

const originalUserAgent = navigator.userAgent;
const originalMaxTouchPoints = navigator.maxTouchPoints;

function setNavigator(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });
}

afterEach(() => {
  setNavigator(originalUserAgent, originalMaxTouchPoints);
  delete (window as { ethereum?: unknown }).ethereum;
});

describe("isMobileDevice", () => {
  test("detects phones", () => {
    setNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    );
    expect(isMobileDevice()).toBe(true);

    setNavigator("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36");
    expect(isMobileDevice()).toBe(true);
  });

  test("detects iPadOS, which masquerades as a Mac", () => {
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit";
    setNavigator(ipad, 5);
    expect(isMobileDevice()).toBe(true);
    // A real Mac reports no touch points and must keep the QR flow.
    setNavigator(ipad, 0);
    expect(isMobileDevice()).toBe(false);
  });

  test("leaves desktop browsers alone", () => {
    setNavigator(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0",
    );
    expect(isMobileDevice()).toBe(false);
  });
});

describe("hasInjectedProvider", () => {
  test("reflects window.ethereum", () => {
    expect(hasInjectedProvider()).toBe(false);
    (window as { ethereum?: unknown }).ethereum = {};
    expect(hasInjectedProvider()).toBe(true);
  });
});

describe("MOBILE_WALLETS", () => {
  const metamask = MOBILE_WALLETS.find((wallet) => wallet.id === "metamask");

  test("percent-encodes the pairing URI into the deep link", () => {
    const uri = "wc:topic@2?relay-protocol=irn&symKey=abc";
    // An unencoded `&` would truncate the URI at the wallet app and the
    // pairing would silently fail.
    expect(metamask?.deepLink(uri)).toBe(
      `metamask://wc?uri=${encodeURIComponent(uri)}`,
    );
  });

  test("falls back to the in-app dapp browser for the current page", () => {
    window.location.href = "https://evmcrispr.com/terminal?script=1";
    // MetaMask reopens the exact page in its own browser, where it injects a
    // provider, so the path and query have to survive the round trip.
    expect(metamask?.dappBrowserLink?.()).toBe(
      "https://metamask.app.link/dapp/evmcrispr.com/terminal?script=1",
    );
  });
});
