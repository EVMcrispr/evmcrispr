import type { HoverRef } from "@evmcrispr/core";
import { Viewer } from "@evmcrispr/editor";
import { titleLine } from "@evmcrispr/space";
import {
  useChangedLines,
  useIsApprovedText,
  useScript,
} from "../app/SpaceContext";
import { useExecutingLine } from "../runs/useRun";

/** The space on screen, read-only: view mode on desktop, always on mobile.
 *  There is no editor here, so whoever changes the script writes the
 *  document and this re-renders. */
export function ScriptView({
  onActivateEdit,
  onOpenDocs,
}: {
  onActivateEdit?: () => void;
  onOpenDocs?: (ref: HoverRef) => void;
}) {
  const { text } = useScript();
  const executingLine = useExecutingLine();
  // While unreviewed: the lines that differ from the approved text.
  const changedLines = useChangedLines();
  // Showing a text nobody approved fetches nothing that text names:
  // asked of each text as it is analysed.
  const isApproved = useIsApprovedText();
  return (
    <Viewer
      script={text}
      titleLine={titleLine(text)}
      changedLines={changedLines}
      remoteModules={isApproved}
      executingLine={executingLine}
      onActivateEdit={onActivateEdit}
      onOpenDocs={onOpenDocs}
    />
  );
}
