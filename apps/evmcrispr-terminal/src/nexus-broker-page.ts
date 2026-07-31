import { initNexusBroker } from "@evmcrispr/ai";

/**
 * Entry for /auth/nexus/broker — embedded as an iframe by trusted external
 * sites so "Login with Dappnode Nexus" runs on this allow-listed origin.
 * Override the parent allow-list per deploy with
 * VITE_NEXUS_BROKER_ALLOWED_ORIGINS (comma-separated exact origins).
 */

const DEFAULT_ALLOWED: (string | RegExp)[] = [
  "https://assertions.eth.limo",
  "https://assertions.eth.link",
  // Local development of embedding sites.
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

const extra = (import.meta.env.VITE_NEXUS_BROKER_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o: string) => o.trim())
  .filter(Boolean);

const button = document.getElementById("login");
if (button instanceof HTMLButtonElement) {
  initNexusBroker({
    allowedOrigins: [...DEFAULT_ALLOWED, ...extra],
    loginButton: button,
    onStatus: (status) => {
      button.disabled = status === "logging-in";
      button.textContent =
        status === "logging-in"
          ? "Waiting for login..."
          : status === "done"
            ? "Logged in ✓"
            : "Login with Dappnode Nexus";
    },
  });
}
