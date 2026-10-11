import type { RevisionEntry, TimelineEntry } from "@evmcrispr/space";

const WHO = { user: "You", assistant: "Assistant", agent: "Agent" };

/**
 * A revision in words: who recorded it and what happened. Read from what
 * the entry says about itself, so it is a label and nothing more: no
 * decision is ever taken from it.
 */
export function revisionLabel(
  entry: RevisionEntry,
  entries: ReadonlyMap<string, TimelineEntry>,
): { who: string; what: string } {
  return { who: WHO[entry.author.kind], what: what(entry, entries) };
}

function what(
  entry: RevisionEntry,
  entries: ReadonlyMap<string, TimelineEntry>,
): string {
  // A program's own explanation of its change.
  if (entry.summary) return entry.summary;
  switch (entry.source) {
    case "import":
      return entry.origin
        ? "imported the script from a link"
        : "imported the script";
    case "revert":
      return "reverted a change";
    case "load": {
      // `from` is the revision acted on: its own text was loaded, or the
      // one before it was restored.
      const from = entry.from ? entries.get(entry.from) : undefined;
      return from?.kind === "revision" && from.text !== entry.text
        ? "restored the script to before a change"
        : "loaded a revision";
    }
    default:
      return entry.parent ? "edited the script" : "created the script";
  }
}
