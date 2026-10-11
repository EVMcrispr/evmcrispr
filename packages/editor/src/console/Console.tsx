import {
  CheckCircleIcon,
  ClockIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import { useEffect, useMemo, useRef } from "react";
import { Alert } from "../ui/Alert";
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

const statusColorClass: Record<LogStatus, string> = {
  error: "text-evm-orange-300",
  success: "text-evm-green-300",
  warning: "text-evm-blue-300",
  info: "text-evm-yellow-300",
};

const statusIcon: Record<LogStatus, typeof XCircleIcon> = {
  error: XCircleIcon,
  success: CheckCircleIcon,
  warning: ClockIcon,
  info: InformationCircleIcon,
};

/** One plain log line, styled by its `:success:` / `:error:` / `:waiting:`
 *  prefix. */
function LogLine({ log, markdown }: { log: string; markdown: boolean }) {
  const _status = status(log);
  const colorClass = statusColorClass[_status];
  const IconComp = statusIcon[_status];
  return (
    <Alert status={_status} variant="solid">
      <div className="flex items-start gap-2">
        <IconComp className={`w-5 h-5 shrink-0 ${colorClass}`} />
        <Alert.Description className="text-base prose prose-invert prose-base max-w-none">
          <ConsoleMarkdown markdown={markdown}>
            {stripString(log)}
          </ConsoleMarkdown>
        </Alert.Description>
      </div>
    </Alert>
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
    <div className="flex flex-col h-full overflow-y-auto px-4 py-3 gap-2">
      {!hasContent && (
        <p className="text-foreground/40 font-head text-base p-4">
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
        <Alert key={`err-${i}`} status="error">
          <div className="flex items-start gap-2">
            <XCircleIcon className="w-5 h-5 shrink-0 text-white" />
            <Alert.Description className="break-all text-base">
              {e}
            </Alert.Description>
          </div>
        </Alert>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
