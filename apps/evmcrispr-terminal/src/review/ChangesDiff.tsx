import type { DiffLine } from "@evmcrispr/space";
import { Button, cn } from "@repo/ui";
import { useState } from "react";

/** Unchanged lines kept around a change; a longer run of them is folded. */
const CONTEXT = 3;

type Part =
  | { kind: "lines"; lines: DiffLine[] }
  | { kind: "fold"; lines: DiffLine[] };

/** Folds every run of unchanged lines longer than the context around it. */
export function foldUnchanged(diff: DiffLine[]): Part[] {
  const parts: Part[] = [];
  const push = (lines: DiffLine[]) => {
    const last = parts.at(-1);
    if (last?.kind === "lines") last.lines.push(...lines);
    else if (lines.length) parts.push({ kind: "lines", lines });
  };
  for (let i = 0; i < diff.length; ) {
    let end = i;
    while (end < diff.length && diff[end].kind === "same") end++;
    if (end === i) {
      push([diff[i++]]);
      continue;
    }
    const run = diff.slice(i, end);
    const head = i === 0 ? 0 : CONTEXT;
    const tail = end === diff.length ? 0 : CONTEXT;
    if (run.length > head + tail + 1) {
      push(run.slice(0, head));
      parts.push({
        kind: "fold",
        lines: run.slice(head, run.length - tail),
      });
      push(run.slice(run.length - tail));
    } else push(run);
    i = end;
  }
  return parts;
}

const SIGN = { same: " ", added: "+", removed: "−" };
const SAID = { same: "", added: "added: ", removed: "removed: " };

function Line({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        "flex gap-2 px-2 whitespace-pre-wrap break-all",
        line.kind === "added" && "bg-success-surface text-added",
        line.kind === "removed" && "bg-danger-surface text-removed",
        line.kind === "same" && "text-fg-faint",
      )}
    >
      <span aria-hidden className="shrink-0 select-none">
        {SIGN[line.kind]}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{SAID[line.kind]}</span>
        {line.text || " "}
      </span>
    </div>
  );
}

function Fold({ lines }: { lines: DiffLine[] }) {
  const [open, setOpen] = useState(false);
  if (open) return lines.map((line, index) => <Line key={index} line={line} />);
  return (
    <Button
      type="button"
      variant="link"
      size="row"
      className="w-full justify-start text-fg-faint"
      onClick={() => setOpen(true)}
    >
      ⋯ {lines.length} unchanged lines
    </Button>
  );
}

/** The script against the approved text, line by line. Plain text: a
 *  line is shown as written, never interpreted. */
export function ChangesDiff({ diff }: { diff: DiffLine[] }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled block of lines, not a form's fieldset
    <div
      role="group"
      aria-label="Changes"
      className="max-h-72 overflow-auto border-2 border-line bg-surface-well py-1 font-mono text-caption leading-relaxed"
    >
      {foldUnchanged(diff).map((part, index) =>
        part.kind === "fold" ? (
          <Fold key={index} lines={part.lines} />
        ) : (
          part.lines.map((line, at) => (
            <Line key={`${index}:${at}`} line={line} />
          ))
        ),
      )}
    </div>
  );
}
