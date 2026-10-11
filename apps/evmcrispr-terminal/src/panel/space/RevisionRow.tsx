import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { cn } from "@repo/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../../app/AppContext";
import { useMarkers, useSpace, useTimeline } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import {
  RowAction as Action,
  RevisionActions,
} from "../../review/RevisionActions";
import { spaceFromEntry } from "../../space/derive";
import { revisionLabel } from "../../space/revision-label";
import type { RevisionRow as Row } from "./rows";
import { ago } from "./time";

/** One recorded state of the script: who made it, what changed, and the
 *  ways to look at it or go back to it. */
export function RevisionRow({ row }: { row: Row }) {
  const { spaces, chats } = useApp();
  const space = useSpace();
  // Private to this browser: the chat this revision came from, while kept.
  const chatId = useMarkers().revisionChats?.[row.entry.id];
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { entry, parent } = row;
  const { who, what } = revisionLabel(
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
          <span className="font-semibold text-foreground/85">{who}</span>{" "}
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
          {entry.author.kind !== "user" && parent && (
            <RevisionActions revisionId={entry.id} />
          )}
          {chatId && chats.getChat(chatId) && (
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
        </div>
      )}
    </div>
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
