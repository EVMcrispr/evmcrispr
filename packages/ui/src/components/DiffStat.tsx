import { cn } from "../utils";

interface DiffStatProps {
  added: number;
  removed: number;
  className?: string;
}

/** Lines added and removed by a change: "+3 −1". */
export function DiffStat({ added, removed, className }: DiffStatProps) {
  return (
    <span
      role="img"
      aria-label={`${added} lines added, ${removed} removed`}
      className={cn(
        "shrink-0 whitespace-nowrap font-mono text-caption tabular-nums",
        className,
      )}
    >
      <span className="text-added">+{added}</span>{" "}
      <span className="text-removed">−{removed}</span>
    </span>
  );
}
