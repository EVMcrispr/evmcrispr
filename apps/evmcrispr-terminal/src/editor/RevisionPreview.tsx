import type { HoverRef } from "@evmcrispr/core";
import { Viewer } from "@evmcrispr/editor";
import { type RevisionEntry, titleLine } from "@evmcrispr/space";
import { Button, Notice, Time } from "@repo/ui";
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
      <Notice
        tone="warning"
        layout="strip"
        live
        className="shrink-0"
        action={
          <>
            <Button
              variant="quiet"
              size="row"
              onClick={() => {
                space.load(revision.text, "load", revision.id);
                back();
              }}
            >
              Load in editor
            </Button>
            <Button variant="quiet" size="row" onClick={back}>
              Back to current
            </Button>
          </>
        }
      >
        Viewing a revision from <Time at={revision.ts} format="clock" />
      </Notice>
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
