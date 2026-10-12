import { useMaybeSpace } from "../../app/SpaceContext";
import { useUi } from "../../app/ui-store";
import { SpacesList } from "./SpacesList";
import { Timeline } from "./Timeline";

/** The Space tab: the list of spaces, and the timeline of the one opened
 *  from it. Without a space on screen there is only the list. */
export function SpaceTab() {
  const space = useMaybeSpace();
  const view = useUi((s) => s.spaceView);
  return view === "list" || !space ? <SpacesList /> : <Timeline />;
}
