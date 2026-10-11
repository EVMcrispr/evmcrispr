import {
  AuthorLabel,
  Badge,
  DiffStat,
  IconButton,
  Row as ListRow,
  Menu,
  Time,
  toast,
} from "@repo/ui";
import {
  CopyPlus,
  Ellipsis,
  Eye,
  Link,
  MessageSquare,
  SquarePen,
  Trash2,
} from "@repo/ui/icons";
import { useState } from "react";
import { useNavigate } from "react-router";
import pinJSON from "../../api/pinata/pin-json";
import { useApp } from "../../app/AppContext";
import { useMarkers, useSpace, useTimeline } from "../../app/SpaceContext";
import { setUi, useUi } from "../../app/ui-store";
import {
  RowAction as Action,
  RevisionActions,
} from "../../review/RevisionActions";
import { UnreviewedBadge } from "../../review/state";
import { removeEntry } from "../../space/cleaning";
import { spaceFromEntry } from "../../space/derive";
import { shareRevision } from "../../space/links";
import { byOthers, revisionLabel } from "../../space/revision-label";
import { Confirm, LeftBehind } from "./Confirm";
import type { RevisionRow as Row } from "./rows";

/** One recorded state of the script: who made it, what changed, and the
 *  ways to look at it or go back to it. */
export function RevisionRow({ row }: { row: Row }) {
  const { spaces, chats, me } = useApp();
  const space = useSpace();
  // Private to this browser: the chat this revision came from, while kept.
  const chatId = useMarkers().revisionChats?.[row.entry.id];
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const viewMode = useUi((s) => s.viewMode);
  const { entry, parent } = row;
  // A revision that was shared hands its link back: the same one, made
  // again of nothing. A script is shared from the header, once reviewed.
  const copyLink = async () => {
    try {
      const shared = await shareRevision(space, entry.id, {
        pin: pinJSON,
        origin: window.location.origin,
        viewMode,
      });
      if (!shared.ok) return;
      await navigator.clipboard.writeText(shared.url);
      toast.success("The link is copied to the clipboard");
    } catch {
      toast.error("The script could not be saved to IPFS");
    }
  };
  // Never for what an export brought: its id is the export's.
  const chat = !entry.unverified && chatId && chats.getChat(chatId);
  const { who, what, claimed } = revisionLabel(
    entry,
    useTimeline((timeline) => timeline.entries),
  );

  /** Puts a recorded text back as the script. Work is never lost: what
   *  was typed since is recorded first, and Ctrl+Z undoes the load. */
  const load = (text: string, from: string) => {
    space.load(text, "load", from);
    setUi({ previewRevisionId: null });
  };

  return (
    <>
      <ListRow
        wrap
        open={open}
        onOpenChange={setOpen}
        title={
          <>
            <AuthorLabel name={who} claimed={claimed} /> {what}
          </>
        }
        meta={
          <>
            <DiffStat added={row.added} removed={row.removed} />
            <Time at={entry.ts} />
            {row.shared && <Badge>shared</Badge>}
            {row.unreviewed && <UnreviewedBadge />}
          </>
        }
        // The way from a change to the chat it came from, while kept.
        actions={
          chat ? (
            <IconButton
              type="button"
              variant="quiet"
              size="sm"
              aria-label="Open chat"
              onClick={() =>
                setUi({
                  activeTab: "agents",
                  chatRequest: { chatId, ts: Date.now() },
                })
              }
            >
              <MessageSquare aria-hidden />
            </IconButton>
          ) : undefined
        }
      >
        <Action
          icon={<Eye />}
          onClick={() => setUi({ previewRevisionId: entry.id })}
        >
          View
        </Action>
        {/* Offered for what someone else wrote, while the text before it
            is still kept. */}
        {byOthers(entry) && parent && <RevisionActions revisionId={entry.id} />}
        <Menu>
          <Menu.Trigger
            render={
              <IconButton
                type="button"
                variant="quiet"
                size="sm"
                aria-label="More actions"
              />
            }
          >
            <Ellipsis aria-hidden />
          </Menu.Trigger>
          <Menu.Content align="start">
            <Menu.Item onClick={() => load(entry.text, entry.id)}>
              <SquarePen aria-hidden />
              Load in editor
            </Menu.Item>
            <Menu.Item
              onClick={async () => {
                // Approved there, approved here; otherwise unreviewed.
                const id = await spaceFromEntry(spaces, space, entry.text);
                navigate(`/${id}`);
              }}
            >
              <CopyPlus aria-hidden />
              Open in new space
            </Menu.Item>
            {row.shared && (
              <Menu.Item onClick={() => void copyLink()}>
                <Link aria-hidden />
                Copy link
              </Menu.Item>
            )}
            <Menu.Item onClick={() => setRemoving(true)}>
              <Trash2 aria-hidden />
              Remove…
            </Menu.Item>
          </Menu.Content>
        </Menu>
      </ListRow>
      {removing && (
        <Confirm
          title="Remove this revision"
          action="Remove"
          onConfirm={() => removeEntry(space, entry.id, me(), Date.now())}
          onClose={() => setRemoving(false)}
        >
          <RemovalNotes entry={entry} label={`${who}, ${what}`} />
        </Confirm>
      )}
    </>
  );
}

/** What removing a revision does, and what it does not reach: said
 *  before it is done, with the counts this browser can work out. */
function RemovalNotes({
  entry,
  label,
}: {
  entry: Row["entry"];
  label: string;
}) {
  const space = useSpace();
  const same = useTimeline(
    (timeline) =>
      [...timeline.entries.values()].filter(
        (other) =>
          other.kind === "revision" &&
          other.id !== entry.id &&
          other.text === entry.text,
      ).length,
  );
  const ran = useTimeline(
    (timeline) =>
      [...timeline.runs.values()].filter((run) => run.revisionId === entry.id)
        .length,
  );
  const onScreen = space.getText() === entry.text;
  return (
    <>
      <p>
        This removes this revision ({label}) and the script text it holds from
        the timeline, in this browser, for good. It removes nothing else:
      </p>
      <ul className="list-disc pl-5">
        <li>
          {same === 0
            ? "No other revision holds exactly this text"
            : same === 1
              ? "1 other revision holds exactly this text and stays"
              : `${same} other revisions hold exactly this text and stay`}
          . Revisions that hold part of it are not counted, and stay too.
        </li>
        {ran > 0 && (
          <li>
            {ran === 1
              ? "1 run of this text keeps what it printed."
              : `${ran} runs of this text keep what they printed.`}
          </li>
        )}
        <li>
          {onScreen
            ? "The script on screen is this very text, and stays as it is: removing a revision does not change the script."
            : "The script on screen is not changed: whatever of this text it still holds stays in it."}
        </li>
      </ul>
      <LeftBehind action="remove" />
      <p>
        To take something out of every earlier version at once, edit it out of
        the script and then use <strong>Clear timeline</strong> in the space's
        menu: it keeps one revision of the script as it is and removes the rest.
      </p>
    </>
  );
}

/** Consecutive revisions of the user's own typing, as one row. */
export function RevisionGroup({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  return (
    <ListRow
      open={open}
      onOpenChange={setOpen}
      title={
        <>
          <AuthorLabel name="You" /> edited the script · {rows.length} revisions
        </>
      }
    >
      <div className="flex w-full flex-col gap-2">
        {rows.map((row) => (
          <RevisionRow key={row.entry.id} row={row} />
        ))}
      </div>
    </ListRow>
  );
}
