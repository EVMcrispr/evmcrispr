import {
  BackButton,
  Badge,
  IconButton,
  Menu,
  PanelHeader,
  toast,
} from "@repo/ui";
import { EllipsisVertical } from "@repo/ui/icons";
import { useState } from "react";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { useScript, useSpace, useTimeline } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import ShareScriptButton from "../../components/scripts/ShareScriptButton";
import {
  clearForMe,
  clearTimeline,
  removeImported,
} from "../../space/cleaning";
import { Confirm, LeftBehind } from "./Confirm";
import { ExportDialog } from "./ExportDialog";
import { useHeaderAction, useScriptLink } from "./HeaderAction";

/** The way back to the list, the space's title, the share link of its
 *  script, and its menu: export and the cleaning actions. The count says how many other spaces have a run
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
  const headerAction = useHeaderAction();
  const named = useScriptLink() !== null;
  return (
    <>
      <PanelHeader
        className="shrink-0"
        emphasis="title"
        // Where the timeline leads with the space's name in a box of its
        // own, the header does not say it twice.
        title={
          named ? (
            <span className="sr-only">{title || "Untitled"}</span>
          ) : (
            title || "Untitled"
          )
        }
        back={
          <BackButton
            label="Spaces"
            onClick={() => setUi({ spaceView: "list" })}
          />
        }
        actions={
          <>
            {pausedElsewhere > 0 && (
              <span title="Runs paused in other spaces">
                <Badge variant="count" tone="warning">
                  <span className="sr-only">Runs paused in other spaces: </span>
                  {pausedElsewhere}
                </Badge>
              </span>
            )}
            {headerAction}
            <ShareScriptButton />
            <Menu>
              <Menu.Trigger
                render={
                  <IconButton
                    type="button"
                    variant="quiet"
                    size="sm"
                    aria-label="Space menu"
                  />
                }
              >
                <EllipsisVertical aria-hidden />
              </Menu.Trigger>
              <Menu.Content align="end">
                <Menu.Item onClick={() => setAsking("export")}>
                  Export space…
                </Menu.Item>
                <Menu.Item
                  onClick={() => {
                    void clearForMe(space, Date.now());
                    toast("Hidden for you. Show earlier brings it back.");
                  }}
                >
                  Clear for me
                </Menu.Item>
                <Menu.Item onClick={() => setAsking("clear")}>
                  Clear timeline…
                </Menu.Item>
                {imported > 0 && (
                  <Menu.Item onClick={() => setAsking("imported")}>
                    Remove imported records…
                  </Menu.Item>
                )}
              </Menu.Content>
            </Menu>
          </>
        }
      />
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
    </>
  );
}
