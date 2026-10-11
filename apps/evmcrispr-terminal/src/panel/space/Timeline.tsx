import { isReviewed } from "@evmcrispr/space";
import { Button, Chip, EmptyState, Row, Time } from "@repo/ui";
import { Trash2 } from "@repo/ui/icons";
import { useMemo, useState } from "react";
import { useApp } from "../../app/AppContext";
import {
  useMarkers,
  useScript,
  useSpace,
  useTimeline,
} from "../../app/SpaceContext";
import { removeEntry, showEarlier } from "../../space/cleaning";
import { useStickToBottom } from "../agents/useStickToBottom";
import { Confirm, LeftBehind } from "./Confirm";
import { PinnedRuns } from "./PinnedRuns";
import { RevisionGroup, RevisionRow } from "./RevisionRow";
import { RunCard } from "./RunCard";
import { type Filter, timelineRows, WINDOW } from "./rows";
import { StdinRow } from "./StdinRow";
import { TimelineHeader } from "./TimelineHeader";

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
  const { me } = useApp();
  const space = useSpace();
  const [removing, setRemoving] = useState<string | null>(null);
  const state = useTimeline((timeline) => timeline);
  const markers = useMarkers();
  const { text } = useScript();
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(WINDOW);
  const reviewed = isReviewed(text, markers.approvedText);
  const { rows, earlier, hidden } = useMemo(
    () => timelineRows(state, markers, { filter, shown, reviewed }),
    [state, markers, filter, shown, reviewed],
  );
  const { listRef, onScroll } = useStickToBottom(rows, false);

  return (
    <div className="flex h-full flex-col">
      <TimelineHeader />
      <fieldset className="m-0 flex shrink-0 gap-2 border-0 p-2.5">
        <legend className="sr-only">Show</legend>
        {FILTERS.map(({ value, label }) => (
          <Chip
            key={value}
            selected={filter === value}
            onSelectedChange={() => setFilter(value)}
          >
            {label}
          </Chip>
        ))}
      </fieldset>
      <PinnedRuns />
      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3"
      >
        {earlier > 0 && (
          <Button
            type="button"
            variant="link"
            size="row"
            className="mb-2 w-full"
            onClick={() =>
              // What Clear for me hid comes back first.
              hidden > 0 ? void showEarlier(space) : setShown((n) => n + WINDOW)
            }
          >
            Show earlier ({earlier})
          </Button>
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
