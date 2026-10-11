import { isReviewed, UNFINISHED } from "@evmcrispr/space";
import {
  Button,
  Chip,
  cn,
  EmptyState,
  Row,
  ScriptFrame,
  ScriptPage,
  Time,
  toast,
} from "@repo/ui";
import { ArrowUp, Eraser, History, Trash2 } from "@repo/ui/icons";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { SCRIPT_MORPH } from "../../app/morph";
import {
  useMarkers,
  useScript,
  useSpace,
  useTimeline,
} from "../../app/SpaceContext";
import { useUi } from "../../app/ui-store";
import ShareScriptButton from "../../components/scripts/ShareScriptButton";
import { UnreviewedBadge } from "../../review/state";
import { clearForMe, removeEntry } from "../../space/cleaning";
import { useStickToBottom } from "../agents/useStickToBottom";
import { Confirm, LeftBehind } from "./Confirm";
import { useScriptLink } from "./HeaderAction";
import { PinnedRuns } from "./PinnedRuns";
import { RevisionGroup, RevisionRow } from "./RevisionRow";
import { RunCard } from "./RunCard";
import { type Filter, PAGE, timelineRows, WINDOW } from "./rows";
import { StdinRow } from "./StdinRow";
import { TimelineHeader } from "./TimelineHeader";
import { usePullToLoad } from "./usePullToLoad";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "revisions", label: "Revisions" },
  { value: "runs", label: "Runs" },
];

/** The timeline of the space on screen: what was recorded of its script
 *  and every run of it, oldest first. */
export function Timeline() {
  const space = useSpace();
  return <TimelineOf key={space.id} />;
}

function TimelineOf() {
  const { me, spaces } = useApp();
  const space = useSpace();
  const [removing, setRemoving] = useState<string | null>(null);
  const state = useTimeline((timeline) => timeline);
  const markers = useMarkers();
  const { text } = useScript();
  const [filter, setFilter] = useState<Filter>("all");
  // How many of the entries left out were asked for, a page at a time.
  const [extra, setExtra] = useState(0);
  const reviewed = isReviewed(text, markers.approvedText);
  // The page starts with a clean timeline: what was recorded before it
  // loaded is hidden as Clear hides it, until it is asked for. Not a run
  // that was going on since, which stays for as long as this view does.
  const since = useUi((ui) => ui.timelineSince);
  const live = useRef(new Set<string>());
  for (const [id, run] of state.runs)
    if (UNFINISHED.includes(run.status)) live.current.add(id);
  const going = live.current.size;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `going` says the set grew
  const { rows, earlier } = useMemo(
    () =>
      timelineRows(state, markers, {
        filter,
        shown: WINDOW,
        reviewed,
        since,
        live: live.current,
        extra,
      }),
    [state, markers, since, going, filter, extra, reviewed],
  );
  /** A page more of what lies before, without moving what is on screen:
   *  the list is scrolled by as much as it grew at its top. */
  const loadPrevious = () => {
    const el = listRef.current;
    const height = el?.scrollHeight ?? 0;
    const top = el?.scrollTop ?? 0;
    flushSync(() => setExtra((n) => n + PAGE));
    if (el) el.scrollTop = top + (el.scrollHeight - height);
  };
  const openScript = useScriptLink();
  const updatedAt = useStore(
    spaces.index,
    (index) => index.find((meta) => meta.id === space.id)?.updatedAt,
  );
  const { listRef, onScroll } = useStickToBottom(rows, false);
  const { pull, holding } = usePullToLoad(listRef, earlier > 0, loadPrevious);

  const events = (
    <>
      <fieldset className="m-0 flex shrink-0 gap-2 border-0 p-2.5">
        <legend className="sr-only">Show</legend>
        {FILTERS.map(({ value, label }) => (
          <Chip
            key={value}
            selected={filter === value}
            // Pressing the chosen filter again goes back to everything.
            onSelectedChange={(on) => setFilter(on ? value : "all")}
          >
            {label}
          </Chip>
        ))}
        <Button
          type="button"
          variant="quiet"
          size="row"
          icon={<Eraser />}
          className="ml-auto"
          onClick={() => {
            setExtra(0);
            void clearForMe(space, Date.now());
            toast("Cleared for you. The link over the list brings it back.");
          }}
        >
          Clear
        </Button>
      </fieldset>
      <PinnedRuns />
      <div
        ref={listRef}
        onScroll={onScroll}
        // Its place is kept by hand when earlier entries arrive.
        className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 [overflow-anchor:none]"
      >
        {/* The content follows a pull, and springs back when let go. */}
        <div
          style={{ transform: pull ? `translateY(${pull}px)` : undefined }}
          className={cn(!pull && "transition-transform duration-200")}
        >
          {/* Not an entry: a way to what lies before the first one. It is
            pressed, or the list is pulled down and held for a moment. */}
          {earlier > 0 && (
            <div className="mb-2 flex flex-col items-center">
              <Button
                type="button"
                variant="link"
                size="row"
                className="gap-1.5"
                onClick={loadPrevious}
              >
                {/* The arrow and the words, on a phone too, where an icon
                    would stand alone. */}
                <ArrowUp aria-hidden data-icon="inline-start" />
                {holding
                  ? "Keep holding…"
                  : `${earlier} previous ${earlier === 1 ? "entry" : "entries"}`}
              </Button>
              {/* The moment the hold takes, filling. */}
              <span
                aria-hidden
                className={cn(
                  "h-0.5 bg-primary",
                  holding
                    ? "w-40 transition-[width] duration-200 ease-linear"
                    : "w-0",
                )}
              />
            </div>
          )}
          <ol
            aria-label="Timeline"
            className="m-0 flex list-none flex-col gap-2 p-0"
          >
            {rows.map((row) =>
              row.kind === "revision" ? (
                <li key={row.entry.id}>
                  <RevisionRow row={row} />
                </li>
              ) : row.kind === "revisions" ? (
                <li key={row.rows[0].entry.id}>
                  <RevisionGroup rows={row.rows} />
                </li>
              ) : row.kind === "run" ? (
                // Room for the card's shadow.
                <li key={row.entry.id} className="pr-1 pb-1">
                  <RunCard runId={row.entry.runId} open={row.expanded} />
                </li>
              ) : (
                <Row
                  key={row.entry.id}
                  as="li"
                  title="You cleared the timeline"
                  meta={<Time at={row.entry.ts} format="clock" />}
                  actions={
                    <Button
                      type="button"
                      variant="quiet"
                      size="row"
                      icon={<Trash2 />}
                      onClick={() => setRemoving(row.entry.id)}
                    >
                      Remove
                    </Button>
                  }
                />
              ),
            )}
            {rows.length === 0 && (
              <li>
                <EmptyState>Nothing here yet.</EmptyState>
              </li>
            )}
          </ol>
        </div>
      </div>
    </>
  );

  return (
    <div
      // Beside the editor the whole timeline is what the space's row
      // opens into; on a phone the script's page is.
      style={{ viewTransitionName: openScript ? undefined : SCRIPT_MORPH }}
      // What a space opening from the list waits to see.
      data-timeline-of={space.id}
      className="flex h-full flex-col"
    >
      <TimelineHeader />
      {openScript ? (
        // Where the script is not beside the timeline, the space is the
        // two of them, in frames alike: the script's head, which opens it,
        // and under it what happened to it, which has the room.
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-2.5">
          <ScriptPage
            className="shrink-0"
            compact
            preview={false}
            title="Script"
            text={text}
            meta={
              <>
                {updatedAt !== undefined && (
                  <span>
                    Updated <Time at={updatedAt} format="day" />
                  </span>
                )}
                {!reviewed && <UnreviewedBadge dot />}
              </>
            }
            onClick={openScript}
            // Sharing is of the script: its link is made from here.
            actions={<ShareScriptButton mobile />}
            transitionName={SCRIPT_MORPH}
          />
          <ScriptFrame
            className="min-h-0 flex-1"
            heading="h2"
            settles={false}
            tone="neutral"
            compact
            icon={<History aria-hidden />}
            title="Timeline"
          >
            <div className="flex h-full flex-col">{events}</div>
          </ScriptFrame>
        </div>
      ) : (
        events
      )}
      {removing && (
        <Confirm
          title="Remove this entry"
          action="Remove"
          onConfirm={() => removeEntry(space, removing, me(), Date.now())}
          onClose={() => setRemoving(null)}
        >
          <p>This removes the note that the timeline was cleared, for good.</p>
          <LeftBehind action="remove" />
        </Confirm>
      )}
      <StdinRow />
    </div>
  );
}
