import { closeReview, surfaceNow } from "../review/surface";
import type { LiveSpace } from "../space/live-space";
import { setUi, uiStore } from "./ui-store";

/**
 * A revision that is removed, here or in another tab, is no longer looked
 * at: the view of it closes, and so does a review whose snapshot lists it
 * (the snapshot holds its text). Returns how to stop watching.
 */
export function stopLookingAtRemoved(space: LiveSpace): () => void {
  return space.timeline.subscribe(({ entries }) => {
    const viewed = uiStore.getState().previewRevisionId;
    if (viewed && !entries.has(viewed)) setUi({ previewRevisionId: null });
    const { shown, spaceId } = surfaceNow();
    if (
      spaceId === space.id &&
      shown?.revisions.some(({ entry }) => !entries.has(entry.id))
    )
      closeReview();
  });
}
