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
}

export function Console({
  entries: entriesProp,
  logs,
  errors,
  placeholder = "Console output will appear here during execution.",
  markdown = false,
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
    if (entries.length === 0 && errors.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries, errors.length]);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto px-4 py-3">
      {!hasContent && (
        <p className="m-0 p-3 font-sans text-body text-fg-faint">
          {placeholder}
        </p>
      )}
      {entries.map((entry, i) => {
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
