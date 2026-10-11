import {
  changedLines,
  deriveTitle,
  isReviewed,
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

/** Whether the script on screen is not the text the user approved. For
 *  what a view shows: a run and a share ask again where they start. */
export function useUnreviewed(): boolean {
  const { text } = useScript();
  return !isReviewed(text, useMarkers().approvedText);
}

/** The 1-based lines of the script on screen that differ from the approved
 *  text, while it is unreviewed: every line when nothing is approved. */
export function useChangedLines(): number[] {
  const { text } = useScript();
  const { approvedText } = useMarkers();
  return useMemo(
    () =>
      isReviewed(text, approvedText)
        ? []
        : approvedText === undefined
          ? text.split("\n").map((_, index) => index + 1)
          : changedLines(approvedText, text),
    [text, approvedText],
  );
}

/**
 * Whether a text is the approved script of the space on screen, asked at
 * the moment of use with the very text in hand: for what must not be
 * decided for one text and applied to another (the editor and the viewer
 * fetch the modules a script names only for a text that passes).
 */
export function useIsApprovedText(): (text: string) => boolean {
  const space = useSpace();
  return useCallback(
    (text) => isReviewed(text, space.markers.getState().approvedText),
    [space],
  );
}
