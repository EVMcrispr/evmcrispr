/**
 * Mobile wallets never inject a provider into a regular mobile browser, so the
 * desktop flows are both dead ends there: `injected()` finds nothing and a QR
 * code cannot be scanned by the phone showing it. The way in is a deep link
 * that hands the WalletConnect pairing URI to the wallet app, which approves
 * the session and bounces the user back to this tab.
 */

export interface MobileWallet {
  id: string;
  name: string;
  /** Opens the wallet app with a WalletConnect pairing URI. */
  deepLink: (uri: string) => string;
  /**
   * Opens this dapp inside the wallet's own browser, where it does inject a
   * provider. Last resort for when WalletConnect is unavailable.
   */
  dappBrowserLink?: () => string;
}

export const MOBILE_WALLETS: readonly MobileWallet[] = [
  {
    id: "metamask",
    name: "MetaMask",
    deepLink: (uri) => `metamask://wc?uri=${encodeURIComponent(uri)}`,
    dappBrowserLink: () => {
      const { host, pathname, search } = window.location;
      return `https://metamask.app.link/dapp/${host}${pathname}${search}`;
    },
  },
];

/**
 * Detects the device, not the viewport: a narrow desktop window should still
 * get the QR flow, since no wallet app is there to answer a deep link.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/Android|iPhone|iPod/i.test(navigator.userAgent)) return true;
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

/** True when some extension or in-app browser injected a provider. */
export function hasInjectedProvider(): boolean {
  return typeof window !== "undefined" && "ethereum" in window;
}
