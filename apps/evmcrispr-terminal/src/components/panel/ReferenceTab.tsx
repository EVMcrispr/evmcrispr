import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import { IconButton, Input } from "@repo/ui";
import { Search } from "@repo/ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  moduleNames,
  type ReferenceEntry,
  referenceEntries,
} from "../../data/reference-data";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";
import { markdownComponents } from "./MarkdownComponents";
import { ReferenceItem } from "./ReferenceItem";

function isUsedInScript(entry: ReferenceEntry, script: string): boolean {
  if (entry.kind === "command") {
    return new RegExp(`(^|\\s)${escapeRegExp(entry.name)}(\\s|$)`, "m").test(
      script,
    );
  }
  // helper: @helperName( or @helperName followed by space/end
  return new RegExp(`@${escapeRegExp(entry.name)}(\\(|\\s|$)`, "m").test(
    script,
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lookup map: (kind + name) -> ReferenceEntry. */
const entryByKey = new Map<string, ReferenceEntry>(
  referenceEntries.map((e) => [`${e.kind}:${e.name}`, e]),
);

export function ReferenceTab() {
  const { script, cursorRef } = useTerminalStore();
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<ReferenceEntry | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  // Track the last cursor-driven name so we don't re-open after the user clicks Back
  const lastCursorKeyRef = useRef<string | null>(null);

  const filteredEntries = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return referenceEntries;
    return referenceEntries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.module.toLowerCase().includes(q),
    );
  }, [query]);

  const usedEntries = useMemo(
    () => filteredEntries.filter((e) => isUsedInScript(e, script)),
    [filteredEntries, script],
  );

  const entriesByModule = useMemo(() => {
    const map = new Map<string, ReferenceEntry[]>();
    for (const mod of moduleNames) {
      const items = filteredEntries.filter((e) => e.module === mod);
      if (items.length > 0) map.set(mod, items);
    }
    return map;
  }, [filteredEntries]);

  const openEntry = useCallback(async (entry: ReferenceEntry) => {
    setSelectedItem(entry);
    setMarkdownContent(null);
    let content = await entry.loadDocs();
    // Strip YAML frontmatter (e.g. ---\ntitle: "..."\n---)
    content = content.replace(/^---[\s\S]*?---\n*/, "");
    // Strip the leading h1 since the detail header already shows the name
    content = content.replace(/^#\s+.+\n+/, "");
    // Strip HTML comments (e.g. <!-- HAND-WRITTEN -->)
    content = content.replace(/<!--[\s\S]*?-->\n*/g, "");
    setMarkdownContent(content);
  }, []);

  const handleItemClick = useCallback(
    (entry: ReferenceEntry) => {
      lastCursorKeyRef.current = null; // manual click clears cursor tracking
      openEntry(entry);
    },
    [openEntry],
  );

  const handleBack = useCallback(() => {
    setSelectedItem(null);
    setMarkdownContent(null);
    // Keep lastCursorKeyRef so we don't immediately re-open the same item
  }, []);

  // Auto-open detail when cursor moves to a recognized command/helper
  useEffect(() => {
    const cursorKey = cursorRef ? `${cursorRef.kind}:${cursorRef.name}` : null;

    // Cursor moved away from any entry
    if (!cursorKey) {
      lastCursorKeyRef.current = null;
      return;
    }

    // Same entry as before — don't re-trigger
    if (cursorKey === lastCursorKeyRef.current) return;

    const entry = entryByKey.get(cursorKey);
    if (entry) {
      lastCursorKeyRef.current = cursorKey;
      terminalStoreActions("activeTab", "reference");
      openEntry(entry);
    }
  }, [cursorRef, openEntry]);

  // Detail view
  if (selectedItem) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to list
          </button>
        </div>
        <div className="px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-mono text-lg text-foreground">
              {selectedItem.kind === "helper"
                ? `@${selectedItem.name}`
                : selectedItem.name}
            </h2>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                selectedItem.kind === "command"
                  ? "bg-evm-blue-300/20 text-evm-blue-300"
                  : "bg-evm-orange-300/20 text-evm-orange-300"
              }`}
            >
              {selectedItem.kind === "command" ? "command" : "helper"}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/60">
              {selectedItem.module}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {markdownContent === null ? (
            <p className="text-foreground/40 text-sm">Loading...</p>
          ) : markdownContent === "" ? (
            <p className="text-foreground/40 text-sm">
              {selectedItem.description}
            </p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-h1:text-base prose-h2:text-sm prose-h2:text-evm-green-300 prose-h2:border-b prose-h2:border-foreground/10 prose-h2:pb-1 prose-h3:text-sm prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-th:text-foreground/70 prose-td:text-foreground/80 prose-li:text-foreground/80 prose-hr:border-foreground/10">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {markdownContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 shrink-0">
        <div className="relative">
          <Input
            placeholder="Search commands & helpers"
            className="text-base pr-10 border"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <IconButton
              aria-label="Search reference"
              size="sm"
              variant="primary"
              className="shadow-none hover:shadow-none active:shadow-none hover:translate-y-0 active:translate-y-0"
            >
              <Search className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="overflow-y-auto flex-1 px-2">
        {usedEntries.length > 0 && (
          <div className="mb-3">
            <h3 className="text-xs font-head uppercase text-evm-green-300 px-3 py-1">
              Used in Script
            </h3>
            <div className="border-l-2 border-evm-green-300/40 ml-2">
              {usedEntries.map((e) => (
                <ReferenceItem
                  key={`used-${e.module}-${e.name}`}
                  entry={e}
                  onClick={() => handleItemClick(e)}
                />
              ))}
            </div>
          </div>
        )}
        {[...entriesByModule.entries()].map(([mod, entries]) => (
          <div key={mod} className="mb-3">
            <h3 className="text-xs font-head uppercase text-foreground/40 px-3 py-1">
              {mod}
            </h3>
            {entries.map((e) => (
              <ReferenceItem
                key={`${mod}-${e.name}`}
                entry={e}
                onClick={() => handleItemClick(e)}
              />
            ))}
          </div>
        ))}
        {filteredEntries.length === 0 && (
          <p className="text-lg text-evm-yellow-300 font-head px-4">
            No matches found.
          </p>
        )}
      </div>
    </div>
  );
}
