import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { useScript, useSpace } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";

/** The way back to the list, and the space's title. The count says how
 *  many other spaces have a run waiting for the user. */
export function TimelineHeader() {
  const { spaces } = useApp();
  const space = useSpace();
  const { title } = useScript();
  const pausedElsewhere = useStore(
    spaces.index,
    (index) =>
      index.filter((meta) => meta.run === "paused" && meta.id !== space.id)
        .length,
  );
  return (
    <div className="flex shrink-0 items-center gap-2 px-2 pt-3">
      <button
        type="button"
        className="flex shrink-0 cursor-pointer items-center gap-0.5 font-sans text-sm text-foreground/70 outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setUi({ spaceView: "list" })}
      >
        <ChevronLeftIcon className="size-4" />
        Spaces
        {pausedElsewhere > 0 && (
          <span
            className="ml-1 rounded-full bg-evm-yellow-300 px-1.5 text-xs font-semibold text-evm-gray-900"
            title="Runs paused in other spaces"
          >
            <span className="sr-only">Runs paused in other spaces: </span>
            {pausedElsewhere}
          </span>
        )}
      </button>
      <h2 className="min-w-0 flex-1 truncate text-right font-head text-base text-evm-yellow-300">
        {title || "Untitled"}
      </h2>
    </div>
  );
}
