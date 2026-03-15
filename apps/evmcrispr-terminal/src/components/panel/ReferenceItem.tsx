import type { ReferenceEntry } from "../../data/reference-data";

export function ReferenceItem({
  entry,
  onClick,
}: {
  entry: ReferenceEntry;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded hover:bg-foreground/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-foreground">
          {entry.kind === "helper" ? `@${entry.name}` : entry.name}
        </span>
        <span
          className={`text-xs ${entry.kind === "command" ? "text-evm-blue-300" : "text-evm-orange-300"}`}
        >
          {entry.kind === "command" ? "cmd" : "@helper"}
        </span>
        {entry.module !== "std" && (
          <span className="text-xs text-foreground/40">{entry.module}</span>
        )}
      </div>
      <p className="text-xs text-foreground/60 truncate mt-0.5">
        {entry.description}
      </p>
    </button>
  );
}
