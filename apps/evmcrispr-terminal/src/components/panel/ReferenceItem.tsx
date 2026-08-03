import { FlaskConical } from "@repo/ui/icons";
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
      className="w-full text-left px-3 py-2 rounded hover:bg-foreground/5 transition-colors leading-tight"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-lg text-foreground truncate">
          {entry.kind === "helper" ? `@${entry.name}` : entry.name}
        </span>
        {entry.experimental && (
          <span title="Experimental" className="shrink-0">
            <FlaskConical className="w-4 h-4" />
          </span>
        )}
        <span
          className={`text-sm ${entry.kind === "command" ? "text-evm-blue-300" : "text-evm-orange-300"}`}
        >
          {entry.kind === "command" ? "cmd" : "@helper"}
        </span>
        {entry.module !== "std" && (
          <span className="text-sm text-foreground/40">{entry.module}</span>
        )}
      </div>
      <p className="text-base text-foreground/60 truncate mt-0.5">
        {entry.description}
      </p>
    </button>
  );
}
