import {
  deriveTitle,
  type Markers,
  type TimelineState,
} from "@evmcrispr/space";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useStore } from "zustand";
import type { LiveSpace } from "../space/live-space";

const SpaceContext = createContext<LiveSpace | null>(null);

/** The space on screen. */
export const SpaceProvider = SpaceContext.Provider;

export function useMaybeSpace(): LiveSpace | null {
  return useContext(SpaceContext);
}

export function useSpace(): LiveSpace {
  const space = useContext(SpaceContext);
  if (!space) throw new Error("useSpace must be used inside <SpaceProvider>");
  return space;
}

/** The text of a space, or "" while none is on screen. */
export function useSpaceText(space: LiveSpace | null): string {
  const subscribe = useCallback(
    (notify: () => void) => {
      space?.text.observe(notify);
      return () => space?.text.unobserve(notify);
    },
    [space],
  );
  return useSyncExternalStore(subscribe, () => space?.getText() ?? "");
}

/** The script of the space on screen, and the title derived from it. */
export function useScript(): { text: string; title: string } {
  const text = useSpaceText(useSpace());
  return useMemo(() => ({ text, title: deriveTitle(text) }), [text]);
}

export function useTimeline<T>(selector: (state: TimelineState) => T): T {
  return useStore(useSpace().timeline, selector);
}

export function useMarkers(): Markers {
  return useStore(useSpace().markers);
}
