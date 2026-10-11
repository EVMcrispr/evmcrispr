import { setUi } from "../app/ui-store";
import { Review } from "./Review";
import { closeReview, useSurface } from "./surface";
import { useApproval, useReview } from "./useReview";

/** The review on desktop. Mounted only while open. What it shows, and
 *  whether anything on it can be approved, is the surface's: it is live
 *  only when the user asked for it (`askForReview`). */
export function ReviewDialog() {
  return useSurface().open ? <OpenReview /> : null;
}

function OpenReview() {
  return (
    <Review
      review={useReview()}
      approval={useApproval()}
      // The run shows in the timeline.
      onRun={() => setUi({ activeTab: "space", spaceView: "timeline" })}
      // Execute is under the script, outside the review.
      onApproved={closeReview}
    />
  );
}
