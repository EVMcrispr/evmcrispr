import type { RevisionEntry, TimelineEntry } from "@evmcrispr/space";

const WHO = { user: "You", assistant: "Assistant", agent: "Agent" };

/** The words for a record that an export brought: nothing vouches for
 *  what it says, so it is never shown as anyone's, least of all "You". */
export const FROM_EXPORT = "From an export";

/**
 * A revision in words: who recorded it and what happened. Read from what
 * the entry says about itself, so it is a label and nothing more: no
 * decision is ever taken from it. For a revision an export brought, `who`
 * says exactly that, and the author it names is `claimed`, to be shown
 * muted beside it.
 */
export function revisionLabel(
  entry: RevisionEntry,
  entries: ReadonlyMap<string, TimelineEntry>,
): { who: string; what: string; claimed?: string } {
  return entry.unverified
    ? {
        who: FROM_EXPORT,
        what: what(entry, entries),
        claimed: WHO[entry.author.kind],
      }
    : { who: WHO[entry.author.kind], what: what(entry, entries) };
}

/** Whether a revision is a change someone or something else made to the
 *  script: what Revert and Restore are offered for. A label like the
 *  rest: the review decides from the text alone. */
export function byOthers(entry: RevisionEntry): boolean {
  return (
    entry.unverified === true ||
    entry.author.kind !== "user" ||
    entry.source === "merge"
  );
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
    case "merge":
      return "replaced the script with the one from a link";
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
