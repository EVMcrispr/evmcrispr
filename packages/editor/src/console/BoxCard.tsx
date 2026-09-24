import type {
  BoxCountdown,
  BoxSnapshot,
  BoxState,
  BoxStep,
} from "@evmcrispr/sdk";
import {
  CheckCircleIcon,
  ClockIcon,
  NoSymbolIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import { type ReactNode, useState } from "react";
import { Alert } from "../ui/Alert";
import { Popover } from "../ui/Popover";
import { ConsoleMarkdown } from "./ConsoleMarkdown";
import { countdownText, type Segment, segments, useNow } from "./countdown";

const boxStatus: Record<BoxState, "warning" | "success" | "error" | "info"> = {
  live: "warning",
  done: "success",
  failed: "error",
  cancelled: "info",
};

const boxIcon: Record<BoxState, typeof ClockIcon> = {
  live: ClockIcon,
  done: CheckCircleIcon,
  failed: XCircleIcon,
  // ⊘: stopped (by the user, a failed script or on-chain), not an error.
  cancelled: NoSymbolIcon,
};

const boxIconClass: Record<BoxState, string> = {
  live: "text-evm-blue-300 animate-spin",
  done: "text-evm-green-300",
  failed: "text-evm-orange-300",
  cancelled: "text-white/70",
};

const boxStateLabel: Record<BoxState, string> = {
  live: "In progress",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface BoxCardProps {
  box: BoxSnapshot;
}

/** One status box: title, live detail, progress, links and history. */
export function BoxCard({ box }: BoxCardProps) {
  const IconComp = boxIcon[box.state];
  const links = Object.entries(box.links ?? {});
  const [done, total] = box.progress ?? [0, 0];
  const percent =
    total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;

  return (
    <Alert
      status={boxStatus[box.state]}
      variant="solid"
      data-box-id={box.id}
      data-box-state={box.state}
    >
      <div className="flex items-start gap-2">
        <IconComp
          className={`w-5 h-5 shrink-0 ${boxIconClass[box.state]}`}
          aria-label={boxStateLabel[box.state]}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-base break-all">{box.title}</span>
            {box.simulated && (
              <span className="rounded border border-white/40 px-1.5 py-0.5 text-xs uppercase tracking-wide text-white/70">
                simulated
              </span>
            )}
          </div>
          <div className="text-base prose prose-invert prose-base max-w-none wrap-break-word">
            <ConsoleMarkdown>{box.detail}</ConsoleMarkdown>
          </div>
          {box.progress && total > 0 && (
            <BoxProgress
              progress={box.progress}
              countdown={box.state === "live" ? box.countdown : undefined}
              steps={box.steps}
              percent={percent}
            />
          )}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-white/40 px-2 py-0.5 text-sm text-evm-green-300 hover:bg-white/10"
                >
                  {label} ↗
                </a>
              ))}
            </div>
          )}
          {box.history.length > 0 && (
            <details className="text-sm text-white/70">
              <summary className="cursor-pointer select-none">
                History ({box.history.length})
              </summary>
              <ol className="mt-1 flex flex-col gap-1 pl-4 list-decimal">
                {box.history.map((line, i) => (
                  <li key={`${box.id}-h-${i}`} className="wrap-break-word">
                    <ConsoleMarkdown>{line}</ConsoleMarkdown>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>
    </Alert>
  );
}

/** Steps done out of total. With a countdown or step links, one segment
 *  per step: done steps full (and linked, when the box links them), the
 *  step the countdown leads to filling faintly until it is due, and the
 *  time left ticking under the bar. */
function BoxProgress({
  progress,
  countdown,
  steps,
  percent,
}: {
  progress: [number, number];
  countdown?: BoxCountdown;
  steps?: BoxStep[];
  percent: number;
}) {
  const now = useNow(countdown !== undefined);
  const [done, total] = progress;
  const parts =
    countdown || steps?.length
      ? segments(progress, countdown, now, steps)
      : null;
  return (
    <div className="flex flex-col gap-1">
      {parts ? (
        // Each segment has a taller hit area than the 6px bar it draws, so
        // a linked one is easy to click, hover and focus.
        <ol
          className="-my-2 flex w-full list-none gap-1 p-0"
          aria-label={`${done} of ${total} done`}
        >
          {parts.map((part, i) => (
            <li key={i} className="m-0 flex-1 p-0">
              <SegmentBar part={part} step={i + 1} />
            </li>
          ))}
        </ol>
      ) : (
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-white/20"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div
            className="h-full bg-evm-green-300 transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {countdown && (
        <p
          role="timer"
          aria-live="off"
          className="self-end text-sm tabular-nums text-white/80"
        >
          {countdownText(countdown, now)}
        </p>
      )}
    </div>
  );
}

/** One step of the bar: done steps full (a link to their page when they
 *  have one), missed ones hatched, the open one filling faintly. */
function SegmentBar({ part, step }: { part: Segment; step: number }) {
  const bar = (
    <span
      className={`block h-1.5 overflow-hidden rounded-sm ${
        part.kind === "done"
          ? "bg-evm-green-300"
          : part.kind === "missed"
            ? "bg-[repeating-linear-gradient(135deg,var(--color-evm-orange-300)_0_2px,transparent_2px_5px)] opacity-70"
            : "bg-white/20"
      }`}
    >
      {part.kind === "upcoming" && (
        <span
          className="block h-full bg-evm-green-300/40 motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear"
          style={{ width: `${part.fill * 100}%` }}
        />
      )}
    </span>
  );
  if (part.kind === "done" && part.href)
    return (
      <StepPopover label={`Segment ${step}`} href={part.href}>
        {bar}
      </StepPopover>
    );
  if (part.kind === "missed")
    return <StepPopover label={`Segment ${step} expired`}>{bar}</StepPopover>;
  return <span className="block py-2">{bar}</span>;
}

/** A step with the terminal's popover naming it above the bar on hover
 *  (and keyboard focus, when it is a link). Anchored rather than a popover
 *  trigger, so clicking a link opens it instead of toggling. */
function StepPopover({
  label,
  href,
  children,
}: {
  label: string;
  href?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const show = {
    onPointerEnter: () => setOpen(true),
    onPointerLeave: () => setOpen(false),
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            {...show}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            className="block rounded-sm py-2 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-evm-green-300"
          >
            {children}
          </a>
        ) : (
          <span {...show} className="block py-2">
            {children}
          </span>
        )}
      </Popover.Anchor>
      <Popover.Content
        side="top"
        sideOffset={2}
        className="pointer-events-none w-auto px-2 py-1 text-xs"
        // A label, not a dialog: focus stays where it was.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {label}
      </Popover.Content>
    </Popover>
  );
}
