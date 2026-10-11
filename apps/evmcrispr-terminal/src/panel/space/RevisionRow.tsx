import { isReviewed } from "@evmcrispr/space";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { cn, toast } from "@repo/ui";
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
import { askForReview } from "../../review/surface";
import { removeEntry } from "../../space/cleaning";
import { spaceFromEntry } from "../../space/derive";
import { shareRevision } from "../../space/links";
import { byOthers, revisionLabel } from "../../space/revision-label";
import { Confirm, LeftBehind } from "./Confirm";
import type { RevisionRow as Row } from "./rows";
import { ago } from "./time";

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
  const [sharing, setSharing] = useState(false);
  const viewMode = useUi((s) => s.viewMode);
  const markers = useMarkers();
  const { entry, parent } = row;
  // Only the approved text is shared. A row holding it shares at once; a
  // row holding the script as it is leads to the review first; any other
  // text has to be loaded and reviewed before it can be shared.
  const approved = isReviewed(entry.text, markers.approvedText);
  const current = entry.text === space.getText();
  const share = async () => {
    setSharing(true);
    try {
      const shared = await shareRevision(space, entry.id, {
        pin: pinJSON,
        origin: window.location.origin,
        viewMode,
      });
      if (shared.ok) {
        await navigator.clipboard.writeText(shared.url);
        toast.success("The link is copied to the clipboard");
      } else if (shared.reason === "unreviewed")
        toast("Review the script before sharing it");
    } catch {
      toast.error("The script could not be saved to IPFS");
    }
    setSharing(false);
  };
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
    <div className="bg-evm-gray-800">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start gap-1.5 px-2 py-1.5 text-left outline-hidden hover:bg-evm-gray-700 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon
          className={cn(
            "mt-1 size-3 shrink-0 text-foreground/40 transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 font-sans text-sm">
          <span
            className={cn(
              "font-semibold",
              claimed ? "text-evm-orange-300" : "text-foreground/85",
            )}
          >
            {who}
          </span>{" "}
          {claimed && (
            <span className="text-foreground/45">(it names {claimed}) </span>
          )}
          <span className="text-foreground/70">{what}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-foreground/45">
            <span>
              <span className="text-evm-green-300">+{row.added}</span>{" "}
              <span className="text-evm-pink-300">−{row.removed}</span>
            </span>
            <span>{ago(entry.ts, Date.now())}</span>
            {row.shared && <span>shared</span>}
            {row.unreviewed && (
              <span className="text-evm-orange-300">unreviewed</span>
            )}
          </span>
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 px-7 pb-2">
          <Action onClick={() => setUi({ previewRevisionId: entry.id })}>
            View
          </Action>
          <Action onClick={() => load(entry.text, entry.id)}>
            Load in editor
          </Action>
          {/* Offered for what someone else wrote, while the text before
              it is still kept. */}
          {byOthers(entry) && parent && (
            <RevisionActions revisionId={entry.id} />
          )}
          {/* Never for what an export brought: its id is the export's. */}
          {!entry.unverified && chatId && chats.getChat(chatId) && (
            <Action
              onClick={() =>
                setUi({
                  activeTab: "agents",
                  chatRequest: { chatId, ts: Date.now() },
                })
              }
            >
              Open chat
            </Action>
          )}
          <Action
            onClick={async () => {
              // Approved there, approved here; otherwise unreviewed.
              const id = await spaceFromEntry(spaces, space, entry.text);
              navigate(`/${id}`);
            }}
          >
            Open in new space
          </Action>
          {row.shared ? (
            <Action onClick={() => void share()}>Copy link</Action>
          ) : approved ? (
            <Action onClick={() => !sharing && void share()}>
              {sharing ? "Sharing…" : "Share"}
            </Action>
          ) : (
            current && (
              // The handler of the user's click, nothing awaited: the
              // review opens on the script as it is now.
              <Action onClick={() => askForReview(space)}>Share</Action>
            )
          )}
          <Action onClick={() => setRemoving(true)}>Remove</Action>
        </div>
      )}
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
    </div>
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
    <div className="bg-evm-gray-800">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left font-sans text-sm outline-hidden hover:bg-evm-gray-700 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-foreground/40 transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="font-semibold text-foreground/85">You</span>
        <span className="text-foreground/70">
          edited the script · {rows.length} revisions
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-px pl-3">
          {rows.map((row) => (
            <RevisionRow key={row.entry.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
