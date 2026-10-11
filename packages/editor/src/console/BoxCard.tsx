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
import { cn } from "../ui/cn";
import { ConsoleMarkdown, httpsUrl } from "./ConsoleMarkdown";
import { countdownText, type Segment, segments, useNow } from "./countdown";

// A box is a framed block in the tone of its state, like a card of
// @repo/ui (which this package cannot import): going on, done, failed,
// stopped. Written out in full for Tailwind to find.
const boxFrame: Record<BoxState, string> = {
  live: "border-info bg-info-surface",
  done: "border-success bg-success-surface",
  failed: "border-danger bg-danger-surface",
  cancelled: "border-edge bg-surface-2",
};

const boxIcon: Record<BoxState, typeof ClockIcon> = {
  live: ClockIcon,
  done: CheckCircleIcon,
  failed: XCircleIcon,
  // ⊘: stopped (by the user, a failed script or on-chain), not an error.
  cancelled: NoSymbolIcon,
};

const boxIconClass: Record<BoxState, string> = {
  // On its own compositor layer: the browser then turns one drawing of
  // the clock. Without it the glyph is drawn afresh at every angle,
  // snapped to whole pixels each time, and seems to wander as it turns.
  live: "text-info",
  done: "text-success",
  failed: "text-danger",
  cancelled: "text-fg-faint",
};

const boxStateLabel: Record<BoxState, string> = {
  live: "In progress",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface BoxCardProps {
  box: BoxSnapshot;
  /** The box is of a run this page made: its text is rendered as
   *  markdown and its links are shown (see `ConsoleProps.markdown`).
   *  Off unless asked for. */
  markdown?: boolean;
}

/** One status box: title, live detail, progress and links. What the
 *  detail said before (`box.history`) is kept in the record, not shown. */
export function BoxCard({ box, markdown = false }: BoxCardProps) {
  const IconComp = boxIcon[box.state];
  // A link is shown only for a run this page made, only to an `https:`
  // address, and with the site it leads to in sight.
  const links = markdown
    ? Object.entries(box.links ?? {}).flatMap(([label, href]) => {
        const url = httpsUrl(href);
        return url ? [[label, url] as const] : [];
      })
    : [];
  const [done, total] = box.progress ?? [0, 0];
  const percent =
    total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;

  return (
    <div
      className={cn(
        "w-full border-2 px-2.5 py-2 font-sans text-fg",
        boxFrame[box.state],
      )}
      data-box-id={box.id}
      data-box-state={box.state}
    >
      <div className="flex items-start gap-2">
        {/* The wrapper turns, on a layer of its own (`will-change`).
            Turned directly, or without the layer, the clock circles a
            point about a pixel beside its middle whenever it sits on
            whole pixels: measured in Chrome, 2px of travel against
            0.07px. */}
        <span
          className={cn(
            "mt-0.5 block size-4 shrink-0",
            box.state === "live" && "animate-spin will-change-transform",
          )}
        >
          <IconComp
            className={`block size-4 ${boxIconClass[box.state]}`}
            aria-label={boxStateLabel[box.state]}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-head text-body font-bold wrap-break-word">
              {box.title}
            </span>
            {box.simulated && (
              <span className="rounded-(--radius) border-2 border-edge px-1.5 text-caption font-medium text-fg-muted">
                simulated
              </span>
            )}
          </div>
          <div className="prose prose-invert prose-sm max-w-none wrap-break-word text-body text-fg-muted">
            <ConsoleMarkdown markdown={markdown}>{box.detail}</ConsoleMarkdown>
          </div>
          {box.progress && total > 0 && (
            <BoxProgress
              progress={box.progress}
              countdown={box.state === "live" ? box.countdown : undefined}
              steps={box.steps?.map((step) =>
                markdown && httpsUrl(step.href)
                  ? step
                  : { ...step, href: undefined },
              )}
              percent={percent}
            />
          )}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map(([label, url]) => (
                <a
                  key={label}
                  href={url.href}
                  title={url.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-(--radius) border-2 border-edge bg-surface-1 px-2 py-0.5 text-caption font-medium text-primary no-underline hover:bg-surface-hover"
                >
                  {label} ↗ <span className="text-fg-faint">{url.host}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
          className="h-2 w-full overflow-hidden bg-surface-active"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div
            className="h-full bg-success transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {countdown && (
        <p
          role="timer"
          aria-live="off"
          className="m-0 self-end text-caption tabular-nums text-fg-muted"
        >
          {countdownText(countdown, now)}
        </p>
      )}
    </div>
  );
}

/** One step of the bar: its drawn width is its elapsed time, solid once
 *  done and faint while open; missed steps are hatched. A done step with a
 *  page is a link to it. */
function SegmentBar({ part, step }: { part: Segment; step: number }) {
  const bar = (
    <span
      className={`block h-2 overflow-hidden ${
        part.kind === "missed"
          ? "bg-[repeating-linear-gradient(135deg,var(--unverified)_0_2px,transparent_2px_5px)] opacity-80"
          : "bg-surface-active"
      }`}
    >
      {(part.kind === "done" || part.kind === "open") && (
        <span
          className={`block h-full motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear ${
            part.kind === "done" ? "bg-success" : "bg-success-line"
          }`}
          style={{ width: `${part.fill * 100}%` }}
        />
      )}
    </span>
  );
  if (part.kind === "done" && part.href)
    return (
      <a
        href={part.href}
        title={part.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Segment ${step}`}
        className="block py-2 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        {bar}
      </a>
    );
  return (
    <span className="block py-2">
      {bar}
      {part.kind === "missed" && (
        <span className="sr-only">Segment {step} expired</span>
      )}
    </span>
  );
}
