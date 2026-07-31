import { useEffect } from "react";

/**
 * Mirrors the visual viewport into CSS custom properties (`--app-height`,
 * `--app-offset-top`) so the mobile shell can shrink with the on-screen
 * keyboard instead of being scrolled out from under it.
 *
 * Chrome honours `interactive-widget=resizes-content` (see index.html) and
 * shrinks the layout viewport itself, so `dvh` would be enough there. iOS
 * Safari ignores that hint: it keeps the layout viewport at full height and
 * scrolls it up to reveal the focused input, which is what slides the header
 * off the top. Sizing the shell to `visualViewport.height` and pinning it to
 * `visualViewport.offsetTop` covers both with the same two variables.
 */
export function useKeyboardInsets(enabled: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) return;

    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      // The keyboard animation fires a burst of resize/scroll events — one
      // write per frame is plenty and keeps the shell from jittering.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--app-height", `${viewport.height}px`);
        root.style.setProperty("--app-offset-top", `${viewport.offsetTop}px`);
      });
    };

    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);

    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset-top");
    };
  }, [enabled]);
}
