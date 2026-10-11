import {
  BackButton,
  Badge,
  Button,
  IconButton,
  Menu,
  PanelHeader,
} from "@repo/ui";
import { Boxes, EllipsisVertical, MessagesSquare } from "@repo/ui/icons";
import { useState } from "react";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { morph, TITLE_MORPH } from "../../app/morph";
import { useScript, useSpace, useTimeline } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import ShareScriptButton from "../../components/scripts/ShareScriptButton";
import { clearTimeline, removeImported } from "../../space/cleaning";
import { Confirm, LeftBehind } from "./Confirm";
import { ExportDialog } from "./ExportDialog";
import { useToChat } from "./HeaderAction";

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
  const toChat = useToChat();
  const toSpaces = () =>
    morph(() => setUi({ spaceView: "list" }), undefined, "closing");
  return (
    <>
      <PanelHeader
        className="shrink-0"
        emphasis="title"
        titleTransitionName={TITLE_MORPH}
        title={title || "Untitled"}
        back={
          toChat ? (
            // On a phone the space was come to from the chat: the way
            // back is the chat's own mark, which says where it goes.
            <IconButton
              type="button"
              variant="quiet"
              size="sm"
              aria-label="Back to chat"
              onClick={toChat}
            >
              <MessagesSquare aria-hidden />
            </IconButton>
          ) : (
            <BackButton label="Spaces" onClick={toSpaces} />
          )
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
            {toChat ? (
              <Button
                type="button"
                variant="neutral"
                size="sm"
                onClick={toSpaces}
              >
                <Boxes aria-hidden data-icon="inline-start" />
                Spaces
              </Button>
            ) : (
              <ShareScriptButton />
            )}
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
