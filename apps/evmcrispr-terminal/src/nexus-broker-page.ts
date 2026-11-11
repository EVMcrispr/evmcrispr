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

/** Looks an embedding site can ask for with `?theme=`; anything else keeps
 *  the terminal's own. A name, never CSS: the parent cannot style this page
 *  beyond the presets defined here. */
const THEMES = new Set(["assertions"]);
const FONTS: Record<string, string> = {
  assertions:
    "https://fonts.googleapis.com/css2?family=Outfit:wght@500&display=swap",
};

const theme = new URLSearchParams(window.location.search).get("theme");
if (theme && THEMES.has(theme)) {
  document.documentElement.dataset.theme = theme;
  const font = FONTS[theme];
  if (font) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = font;
    document.head.append(link);
  }
}

const button = document.getElementById("login");
const label = document.getElementById("login-label") ?? button;
if (button instanceof HTMLButtonElement && label) {
  initNexusBroker({
    allowedOrigins: [...DEFAULT_ALLOWED, ...extra],
    loginButton: button,
    onStatus: (status) => {
      button.disabled = status === "logging-in";
      label.textContent =
        status === "logging-in"
          ? "Waiting for login..."
          : status === "done"
            ? "Logged in ✓"
            : "Login with Dappnode Nexus";
    },
  });
}
