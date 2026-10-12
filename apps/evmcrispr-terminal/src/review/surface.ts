// Whether the review of the space on screen is open (the dialog on
// desktop, the sheet on mobile), and what the user asked to see on it.
// This is the one place that state lives, and the three functions below
// are its only writers: the store itself is not exported. A review is
// live for approving only through `askForReview`, which a handler of the
// user's own click or tap calls; anything else that puts the review in
// front of the user (`showReview`) shows no changes and offers no Approve
// until they ask.
import { toast } from "@repo/ui";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { LiveSpace } from "../space/live-space";
import { type Changes, changesOf } from "./changes";

/** How long what Approve approves has to have been on screen before the
 *  button takes a click: one that was on its way somewhere else (a double
 *  click, a click queued while the page was busy) approves nothing. */
export const ARM_MS = 400;

export interface Surface {
  open: boolean;
  /** The space `shown` is of. */
  spaceId: string | null;
  /** The changes the user asked to see, as they were at that moment: a
   *  snapshot. Null when they have not asked. */
  shown: Changes | null;
  /** When `shown` was put on screen (`performance.now()`). */
  shownAt: number;
}

const CLOSED: Surface = { open: false, spaceId: null, shown: null, shownAt: 0 };
const store = createStore<Surface>(() => CLOSED);

/**
 * The user asks to see the review of `space`, now: it opens, or is
 * refreshed, on the changes as they are at this moment. Call it only from
 * the handler of something the user just did, with nothing awaited before
 * it.
 */
export function askForReview(space: LiveSpace): void {
  let shown: Changes;
  try {
    shown = changesOf(
      space.getText(),
      space.markers.getState().approvedText,
      space.timeline.getState(),
    );
  } catch {
    // Nothing is shown, so nothing can be approved.
    toast.error("The changes could not be worked out");
    return;
  }
  store.setState(
    { open: true, spaceId: space.id, shown, shownAt: performance.now() },
    true,
  );
}

/** The review comes up without the user having asked for it (a run was
 *  refused, a run needs them). It shows what was already asked for, if it
 *  was open, and otherwise nothing to approve. */
export function showReview(): void {
  if (!store.getState().open) store.setState({ ...CLOSED, open: true }, true);
}

export function closeReview(): void {
  store.setState(CLOSED, true);
}

/** Read-only: views subscribe, nobody writes through this. */
export const useSurface = (): Surface => useStore(store);
export const surfaceNow = (): Surface => store.getState();
