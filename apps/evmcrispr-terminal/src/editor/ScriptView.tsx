import type { HoverRef } from "@evmcrispr/core";
import { Viewer } from "@evmcrispr/editor";
import { titleLine } from "@evmcrispr/space";
import { useScript } from "../app/SpaceContext";
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
  return (
    <Viewer
      script={text}
      titleLine={titleLine(text)}
      executingLine={executingLine}
      onActivateEdit={onActivateEdit}
      onOpenDocs={onOpenDocs}
    />
  );
}
