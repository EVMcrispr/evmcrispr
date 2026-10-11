import { deriveTitle, emptyTimeline, mergeable } from "@evmcrispr/space";
import { Button, Notice } from "@repo/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { restoreSpace, type SpaceExport } from "../../space/export";

/**
 * What an export link shows: the question of what to do with it. Opening
 * the link fetched and checked the export and did nothing else; nothing
 * is made, merged, simulated or fetched until one of these buttons is
 * pressed. An export names the space it goes into, and that may be one of
 * the user's: whether it is is read from the list as it is now, said
 * plainly, and asked again by `restoreSpace` at the moment of acting.
 * The script is not drawn here: it is on screen once the user has chosen
 * to open it.
 */
export function RestorePrompt({ exported }: { exported: SpaceExport }) {
  const { spaces } = useApp();
  const navigate = useNavigate();
  const mine = useStore(spaces.index, (list) =>
    list.find((meta) => meta.id === exported.id),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const total = (kind: "revision" | "run") =>
    exported.timeline.entries.filter((entry) => entry.kind === kind).length;
  // What would come in were it restored where there is nothing.
  const kept = (
    mergeable(emptyTimeline, exported.timeline).entries ?? []
  ).filter((entry) => entry.kind === "revision").length;

  const act = async (mode: "restore" | "merge" | "copy") => {
    setBusy(true);
    setNote("");
    try {
      const result = await restoreSpace(spaces, exported, mode);
      if (result.ok) return navigate(`/${result.id}`, { replace: true });
      // The list changed while the question was on screen: it is asked
      // again as it now stands, and nothing was done.
      setNote(
        result.reason === "present"
          ? "This space has appeared in this browser since you opened the link. Nothing was done: look at the choices again."
          : "This space is no longer in this browser. Nothing was done: look at the choices again.",
      );
    } catch {
      setNote("That did not work. Nothing was changed.");
    }
    setBusy(false);
  };

  const [next] = useStore(spaces.index);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 animate-fade-in">
      <div className="flex max-w-xl flex-col gap-3 font-sans text-body text-fg-muted">
        <h2 className="m-0 font-head text-display font-bold text-heading">
          This link holds a whole space
        </h2>
        <p>
          “{deriveTitle(exported.script) || "Untitled"}”: a script of{" "}
          {exported.script.split("\n").length} lines, with {total("revision")}{" "}
          revisions and {total("run")} runs recorded by whoever made the link.
          {kept < total("revision") &&
            ` A space keeps ${kept} revisions from links: the latest are taken.`}
        </p>
        {mine ? (
          <Notice tone="warning" urgent>
            This link goes into a space you already have: “{mine.title}”.{" "}
            <strong>Merge</strong> replaces its script with the one in the link
            and adds the link's revisions and runs to yours, marked as from an
            export. Nothing you recorded is removed, and you will be asked to
            review the new script before it can run or be shared.
          </Notice>
        ) : (
          <p>
            <strong>Restore</strong> brings it into this browser as it is. Its
            script becomes the one you start from, as when you open a shared
            script; what it recorded is kept marked as from an export.
          </p>
        )}
        <p>
          <strong>Open as copy</strong> makes a new space from its script alone.
        </p>
        {note && (
          <Notice tone="warning" layout="inline" urgent>
            {note}
          </Notice>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {mine ? (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void act("merge")}
          >
            Merge into “{mine.title}”
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void act("restore")}
          >
            Restore
          </Button>
        )}
        <Button
          type="button"
          variant="neutral"
          disabled={busy}
          onClick={() => void act("copy")}
        >
          Open as copy
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={busy}
          onClick={() =>
            navigate(next ? `/${next.id}` : "/", { replace: true })
          }
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
