import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { cn } from "../ui/cn";
import { PROSE } from "../ui/prose";
import { BoxCard } from "./BoxCard";
import { ConsoleMarkdown } from "./ConsoleMarkdown";
import type { ConsoleEntry } from "./entries";

type LogStatus = "success" | "error" | "warning" | "info";

const status = (log: string): LogStatus => {
  return log.startsWith(":success:")
    ? "success"
    : log.startsWith(":error:")
      ? "error"
      : log.startsWith(":waiting:")
        ? "warning"
        : "info";
};

const stripString = (log: string): string => {
  return log.startsWith(":success:")
    ? log.slice(":success:".length)
    : log.startsWith(":error:")
      ? log.slice(":error:".length)
      : log.startsWith(":waiting:")
        ? log.slice(":waiting:".length)
        : log;
};

// A line is a framed block like a status box (see BoxCard). A plain one
// has no colour and no icon: it is what the script printed. The marked
// ones take the tone of what they report. Written out in full for
// Tailwind to find.
const lineFrame: Record<LogStatus, string> = {
  info: "border-edge bg-surface-2",
  success: "border-success bg-success-surface",
  error: "border-danger bg-danger-surface",
  warning: "border-info bg-info-surface",
};

const statusColorClass: Record<LogStatus, string> = {
  info: "",
  success: "text-success",
  error: "text-danger",
  warning: "text-info",
};

const statusIcon: Record<LogStatus, typeof XCircleIcon | null> = {
  info: null,
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ClockIcon,
};

const statusLabel: Record<LogStatus, string> = {
  info: "",
  success: "Passed",
  error: "Failed",
  warning: "Waiting",
};

/** One framed line of output. */
function Line({
  status: tone,
  children,
}: {
  status: LogStatus;
  children: ReactNode;
}) {
  const IconComp = statusIcon[tone];
  return (
    <div
      data-line-status={tone}
      className={cn(
        "flex w-full items-start gap-2 border-2 px-2.5 py-2 font-sans text-fg",
        lineFrame[tone],
      )}
    >
      {IconComp && (
        <IconComp
          className={`mt-0.5 size-4 shrink-0 ${statusColorClass[tone]}`}
          aria-label={statusLabel[tone]}
        />
      )}
      <div className={`${PROSE} min-w-0 flex-1`}>{children}</div>
    </div>
  );
}

/** One plain log line, in the tone of its `:success:` / `:error:` /
 *  `:waiting:` prefix. */
function LogLine({ log, markdown }: { log: string; markdown: boolean }) {
  return (
    <Line status={status(log)}>
      <ConsoleMarkdown markdown={markdown}>{stripString(log)}</ConsoleMarkdown>
    </Line>
  );
}

export interface ConsoleProps {
  /** Log lines and status boxes in order (from `useExecutionLogs`). */
  entries?: ConsoleEntry[];
  /** Plain log lines. Used only when `entries` is not given. */
  logs?: string[];
  errors: string[];
  /** Shown when there are no logs or errors yet. */
  placeholder?: string;
  /** Render the output as markdown (see `ConsoleMarkdown` for what that
   *  allows). Off unless asked for: output is shown as plain text. Ask for
   *  it only for a run this page made. An entry marked `unverified` (from
   *  a console that arrived from outside) is plain text whatever this
   *  says, and its boxes show no link. */
  markdown?: boolean;
  /** Shows the first `head` and the last `tail` entries, and every status
   *  box wherever it is, with one line in place of each stretch left
   *  out: "… 480 more lines", which calls `onOpen` (the whole log is
   *  somewhere else). For a console that must stay short, with no scroll
   *  of its own. */
  fold?: { head: number; tail: number; onOpen: () => void };
  /** `false`: new output does not scroll anything into view. For a
   *  console inside something else that scrolls. */
  follow?: boolean;
}

/** An entry to draw, or the place of `count` entries left out. */
type Shown =
  | { entry: ConsoleEntry; index: number }
  | { folded: number; index: number };

/** What a folded console draws: see `ConsoleProps.fold`. Folding only
 *  happens where it leaves out more than a line or two. */
function folded(entries: ConsoleEntry[], fold: ConsoleProps["fold"]): Shown[] {
  const all = entries.map((entry, index) => ({ entry, index }));
  if (!fold || entries.length <= fold.head + fold.tail + 2) return all;
  const shown: Shown[] = [];
  for (const item of all) {
    const kept =
      item.index < fold.head ||
      item.index >= entries.length - fold.tail ||
      item.entry.kind === "box";
    const last = shown.at(-1);
    if (kept) shown.push(item);
    else if (last && "folded" in last) last.folded += 1;
    else shown.push({ folded: 1, index: item.index });
  }
  return shown;
}

export function Console({
  entries: entriesProp,
  logs,
  errors,
  placeholder = "Console output will appear here during the run.",
  markdown = false,
  fold,
  follow = true,
}: ConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<ConsoleEntry[]>(
    () =>
      entriesProp ??
      (logs ?? []).map((text) => ({ kind: "line" as const, text })),
    [entriesProp, logs],
  );

  const hasContent = entries.length > 0 || errors.length > 0;

  // Follow new output, including in-place box updates (a new `entries`
  // array on every change). `block: "nearest"` keeps the scroll inside the
  // console's own container — never the embedding page.
  useEffect(() => {
    if (!follow) return;
    if (entries.length === 0 && errors.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries, errors.length, follow]);

  const shown = useMemo(() => folded(entries, fold), [entries, fold]);

  return (
    <div
      className={
        fold
          ? "flex flex-col gap-2 px-4 py-3"
          : "flex h-full flex-col gap-2 overflow-y-auto px-4 py-3"
      }
    >
      {!hasContent && (
        <p className="m-0 p-3 font-sans text-body text-fg-faint">
          {placeholder}
        </p>
      )}
      {shown.map((item) => {
        if ("folded" in item)
          return (
            <button
              key={`fold-${item.index}`}
              type="button"
              onClick={fold?.onOpen}
              className="cursor-pointer self-center rounded-(--radius) border-0 bg-transparent px-2 py-0.5 font-sans text-caption text-primary outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              … {item.folded} more {item.folded === 1 ? "line" : "lines"}
            </button>
          );
        const { entry, index: i } = item;
        // Decided from the entry itself: no caller can ask for more.
        const rich = markdown && !entry.unverified;
        return entry.kind === "box" ? (
          <BoxCard
            key={`box-${entry.box.id}`}
            box={entry.box}
            markdown={rich}
          />
        ) : (
          <LogLine key={`log-${i}`} log={entry.text} markdown={rich} />
        );
      })}
      {errors.map((e, i) => (
        <Line key={`err-${i}`} status="error">
          {e}
        </Line>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
