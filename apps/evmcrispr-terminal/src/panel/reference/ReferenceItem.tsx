import { Badge, Row } from "@repo/ui";
import { FlaskConical } from "@repo/ui/icons";
import type { ReferenceEntry } from "../../data/reference-data";

/** What an entry is, in one word. A helper that can also be read when the
 *  transaction runs, as `@name!`, says so with the mark it is called by. */
export function kindLabel(entry: ReferenceEntry, long = false): string {
  if (entry.kind === "command") return long ? "command" : "cmd";
  const mark = entry.onchain && !entry.name.endsWith("!") ? "!" : "";
  return `${long ? "helper" : "@helper"}${mark}`;
}

export function ReferenceItem({
  entry,
  onClick,
}: {
  entry: ReferenceEntry;
  onClick: () => void;
}) {
  return (
    <Row
      onClick={onClick}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-fg">
            {entry.kind === "helper" ? `@${entry.name}` : entry.name}
          </span>
          {entry.experimental && (
            <span title="Experimental" className="shrink-0">
              <FlaskConical aria-hidden className="size-3.5" />
            </span>
          )}
          <Badge tone={entry.kind === "command" ? "success" : "warning"}>
            {kindLabel(entry)}
          </Badge>
          {entry.module !== "std" && <Badge>{entry.module}</Badge>}
        </span>
      }
      meta={<span className="truncate">{entry.description}</span>}
    />
  );
}
