import {
  ChevronLeftIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/solid";
import { Menu, toast } from "@repo/ui";
import { useState } from "react";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { useScript, useSpace, useTimeline } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import {
  clearForMe,
  clearTimeline,
  removeImported,
} from "../../space/cleaning";
import { Confirm, LeftBehind } from "./Confirm";
import { ExportDialog } from "./ExportDialog";

/** The way back to the list, the space's title, and its menu: export and
 *  the cleaning actions. The count says how many other spaces have a run
 *  waiting for the user. */
export function TimelineHeader() {
  const { spaces, me } = useApp();
  const [asking, setAsking] = useState<"export" | "clear" | "imported" | null>(
    null,
  );
  const imported = useTimeline(
    (timeline) =>
      [...timeline.entries.values()].filter((entry) => entry.unverified).length,
  );
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
      <Menu>
        <Menu.Trigger asChild>
          <button
            type="button"
            aria-label="Space menu"
            className="shrink-0 cursor-pointer p-1 text-foreground/60 outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EllipsisVerticalIcon className="size-5" />
          </button>
        </Menu.Trigger>
        <Menu.Content align="end">
          <Menu.Item onSelect={() => setAsking("export")}>
            Export space…
          </Menu.Item>
          <Menu.Item
            onSelect={() => {
              void clearForMe(space, Date.now());
              toast("Hidden for you. Show earlier brings it back.");
            }}
          >
            Clear for me
          </Menu.Item>
          <Menu.Item onSelect={() => setAsking("clear")}>
            Clear timeline…
          </Menu.Item>
          {imported > 0 && (
            <Menu.Item onSelect={() => setAsking("imported")}>
              Remove imported records…
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu>
      {asking === "export" && <ExportDialog onClose={() => setAsking(null)} />}
      {asking === "clear" && (
        <Confirm
          title="Clear timeline"
          action="Clear timeline"
          onConfirm={() => clearTimeline(space, me(), Date.now())}
          onClose={() => setAsking(null)}
        >
          <p>
            This removes every revision and every finished run of “
            {title || "Untitled"}” from this space, for good.
          </p>
          <p>
            It keeps the script as it is now, runs that have not finished, and
            the revisions you shared. Whether the script is reviewed does not
            change. Undo is emptied too, in the editor and in every tab, so it
            cannot bring an earlier version back.
          </p>
          <LeftBehind action="clearTimeline" />
        </Confirm>
      )}
      {asking === "imported" && (
        <Confirm
          title="Remove imported records"
          action="Remove them"
          onConfirm={() => removeImported(space)}
          onClose={() => setAsking(null)}
        >
          <p>
            This removes the {imported} revisions and runs that exports brought
            into “{title || "Untitled"}”: the ones marked “from an export”.
          </p>
          <p>
            Nothing you recorded here is touched, nor the script. Opening the
            link again brings them back.
          </p>
          <LeftBehind action="removeImported" />
        </Confirm>
      )}
    </div>
  );
}
