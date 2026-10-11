import type { HoverRef } from "@evmcrispr/core";
import { Viewer } from "@evmcrispr/editor";
import { type RevisionEntry, titleLine } from "@evmcrispr/space";
import { Button } from "@repo/ui";
import { useIsApprovedText, useSpace, useTimeline } from "../app/SpaceContext";
import { setUi, useUi } from "../app/ui-store";

/** The revision being viewed, when it belongs to the space on screen. */
export function usePreviewedRevision(): RevisionEntry | null {
  const id = useUi((s) => s.previewRevisionId);
  return useTimeline((timeline) => {
    const entry = id ? timeline.entries.get(id) : undefined;
    return entry?.kind === "revision" ? entry : null;
  });
}

/** A revision shown without loading it: the script stays as it is until
 *  the user asks for the revision to be loaded. */
export function RevisionPreview({
  revision,
  onOpenDocs,
}: {
  revision: RevisionEntry;
  onOpenDocs?: (ref: HoverRef) => void;
}) {
  const space = useSpace();
  const isApproved = useIsApprovedText();
  const back = () => setUi({ previewRevisionId: null });
  return (
    <div className="flex h-full flex-col">
      <div
        role="status"
        className="flex shrink-0 flex-wrap items-center gap-2 border border-evm-yellow-300/40 bg-evm-yellow-300/5 px-3 py-1.5 font-sans text-sm"
      >
        <span className="min-w-0 flex-1 text-foreground/80">
          Viewing a revision from{" "}
          {new Date(revision.ts).toLocaleString("en", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="shadow-none"
          onClick={() => {
            space.load(revision.text, "load", revision.id);
            back();
          }}
        >
          Load in editor
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="shadow-none"
          onClick={back}
        >
          Back to current
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Viewer
          script={revision.text}
          titleLine={titleLine(revision.text)}
          // Looking at a recorded text that is not the approved script
          // fetches nothing that text names.
          remoteModules={isApproved}
          onOpenDocs={onOpenDocs}
        />
      </div>
    </div>
  );
}
