import { toast } from "@repo/ui";
import { useStore } from "zustand";
import { useApp } from "../app/AppContext";
import { useSpace, useTimeline } from "../app/SpaceContext";
import { setUi } from "../app/ui-store";
import { useScriptInput } from "../hooks/useScriptInput";
import { showReview } from "../review/surface";
import { isUnfinished, type LiveRun, type Run } from "./run-manager";

/** The run of the space on screen that this tab is running: its
 *  unfinished real run, else null. */
export function useActiveRun(): LiveRun | null {
  const { runs } = useApp();
  const space = useSpace();
  return useStore(
    runs.store,
    (all) =>
      Object.values(all).find(
        (run) =>
          run.spaceId === space.id &&
          run.record.mode === "real" &&
          isUnfinished(run.record),
      ) ?? null,
  );
}

/** A run of the space on screen by id: live when this tab runs or ran it,
 *  else its record as stored. */
export function useRunOf(
  runId: string,
): { record: Run; live: LiveRun | null } | null {
  const { runs } = useApp();
  const live = useStore(runs.store, (all) => all[runId] ?? null);
  const stored = useTimeline((t) => t.runs.get(runId) as Run | undefined);
  const record = live?.record ?? stored;
  return record ? { record, live } : null;
}

/** Whether a real run of the space on screen is going on in another tab,
 *  as its record says. For display: what refuses a second run is the lock. */
export function useRunningElsewhere(): boolean {
  const { runs } = useApp();
  const mine = useStore(runs.store);
  return useTimeline((t) =>
    [...t.runs.values()].some(
      (run) => run.mode === "real" && isUnfinished(run) && !mine[run.id],
    ),
  );
}

/** The line the editor highlights. */
export function useExecutingLine(): number | null {
  return useActiveRun()?.line ?? null;
}

/** The last real run this tab started for the space on screen, over or
 *  not: what a view that follows "the run" shows. */
export function useLatestRun(): LiveRun | null {
  const { runs } = useApp();
  const space = useSpace();
  return useStore(
    runs.store,
    (all) =>
      Object.values(all)
        .filter((run) => run.spaceId === space.id && run.record.mode === "real")
        .sort((a, b) => b.record.startedAt - a.record.startedAt)[0] ?? null,
  );
}

const REFUSED = {
  elsewhere: "This space is running in another tab",
  busy: "This space is already running",
  "off-screen": "Open the space to run its script",
  missing: "This space is no longer here",
  changed: "The script changed: look at it again before running",
};

/** Asks for a real run of the space on screen, with its stdin. Given the
 *  text a surface has on display, the run is of that text or none. An
 *  unreviewed script is refused where runs start; this opens its review. */
export function useExecute(): (shown?: string) => Promise<void> {
  const { runs } = useApp();
  const space = useSpace();
  const { input } = useScriptInput(space.id);
  return async (shown) => {
    // What runs is the script, not a revision being looked at.
    setUi({ previewRevisionId: null });
    const started = await runs.start(space.id, {
      mode: "real",
      stdin: input?.text,
      ...(shown !== undefined ? { text: shown } : {}),
    });
    if (started.ok) return;
    // After a wait, so not as the user asking: it shows nothing to approve
    // until they do.
    if (started.reason === "unreviewed") showReview();
    else toast.error(REFUSED[started.reason]);
  };
}
