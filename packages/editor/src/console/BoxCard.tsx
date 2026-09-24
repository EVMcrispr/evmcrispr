import type { BoxSnapshot, BoxState } from "@evmcrispr/sdk";
import {
  CheckCircleIcon,
  ClockIcon,
  NoSymbolIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import { Alert } from "../ui/Alert";
import { ConsoleMarkdown } from "./ConsoleMarkdown";

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
