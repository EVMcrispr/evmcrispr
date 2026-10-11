import { useEffect, useRef } from "react";

import { type PanelTab, useUi } from "../app/ui-store";

/** Focus the referenced element when the given side-panel tab is revealed.
 *  Tabs stay mounted but hidden (`forceMount`), so the native autoFocus
 *  attribute would fire only once at page load, on a hidden element.
 *  Only transitions into the tab count — the default tab must not grab
 *  focus on page load (on mobile that would pop the keyboard). */
export function useFocusOnTab<T extends HTMLElement>(tab: PanelTab) {
  const ref = useRef<T | null>(null);
  const activeTab = useUi((s) => s.activeTab);
  const prevTabRef = useRef<PanelTab | null>(null);

  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (activeTab !== tab || prev === null || prev === tab) return;
    // Deferred a frame: the click that activated the tab focuses the
    // trigger button as its default action *after* this effect runs.
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [activeTab, tab]);

  return ref;
}
