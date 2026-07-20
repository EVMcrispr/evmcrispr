import { collectScriptUsage, type ScriptUsage } from "@evmcrispr/core";
import type { CursorRef } from "@evmcrispr/editor";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import { IconButton, Input } from "@repo/ui";
import { Search } from "@repo/ui/icons";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type ConfigEntry,
  moduleConfigs,
  moduleNames,
  type ReferenceEntry,
  referenceEntries,
  resolveDocLinkEntry,
} from "../../data/reference-data";
import {
  terminalStoreActions,
  useTerminalStore,
} from "../../stores/terminal-store";
import {
  createMarkdownComponents,
  type DocLinkResolution,
} from "./MarkdownComponents";
import { ReferenceItem } from "./ReferenceItem";

const EMPTY_USAGE: ScriptUsage = {
  commands: new Set(),
  helpers: new Set(),
  configVars: new Set(),
  commandBindings: new Map(),
  helperBindings: new Map(),
};

function ConfigRow({ mod, entry }: { mod: string; entry: ConfigEntry }) {
  return (
    <div
      className="px-3 py-2 leading-tight"
      title={
        entry.default
          ? `${entry.description} Default: ${entry.default}`
          : entry.description
      }
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-lg text-foreground truncate">
          ${mod}:{entry.name}
        </span>
        <span className="text-sm text-evm-green-300">config</span>
        <span className="text-sm text-foreground/40">{entry.type}</span>
        {mod !== "std" && (
          <span className="text-sm text-foreground/40">{mod}</span>
        )}
      </div>
      <p className="text-base text-foreground/60 truncate mt-0.5">
        {entry.description}
      </p>
    </div>
  );
}

/** Lookup map: (kind + module + name) -> ReferenceEntry. */
const entryByKey = new Map<string, ReferenceEntry>(
  referenceEntries.map((e) => [`${e.kind}:${e.module}:${e.name}`, e]),
);

/** Resolve a cursor ref to its entry: explicit `mod:` prefix wins, then the
 *  script's load-import bindings (honoring `>` renames), then std — the same
 *  order the semantic analyzer uses. Falls back to any module defining the
 *  name so a bare match still opens something while the load line is absent
 *  or mid-edit. */
function resolveCursorEntry(
  ref: CursorRef,
  usage: ScriptUsage,
): ReferenceEntry | undefined {
  const bindings =
    ref.kind === "command" ? usage.commandBindings : usage.helperBindings;
  const bound = ref.module
    ? { module: ref.module, name: ref.name }
    : (bindings.get(ref.name) ?? { module: "std", name: ref.name });
  return (
    entryByKey.get(`${ref.kind}:${bound.module}:${bound.name}`) ??
    referenceEntries.find((e) => e.kind === ref.kind && e.name === ref.name)
  );
}

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

  // AST-based usage: parse the (deferred) script and keep the last result
  // that parsed, so the Used section doesn't flicker on mid-edit breakage.
  const deferredScript = useDeferredValue(script);
  const lastGoodUsage = useRef<ScriptUsage>(EMPTY_USAGE);
  const usage = useMemo(() => {
    const u = collectScriptUsage(deferredScript);
    if (u) lastGoodUsage.current = u;
    return lastGoodUsage.current;
  }, [deferredScript]);

  const usedEntries = useMemo(
    () =>
      filteredEntries.filter((e) =>
        (e.kind === "command" ? usage.commands : usage.helpers).has(
          `${e.module}:${e.name}`,
        ),
      ),
    [filteredEntries, usage],
  );

  const usedConfigs = useMemo(() => {
    const out: Array<{ mod: string; entry: ConfigEntry }> = [];
    for (const [mod, cfgs] of moduleConfigs) {
      for (const c of cfgs) {
        if (usage.configVars.has(`${mod}:${c.name}`)) {
          out.push({ mod, entry: c });
        }
      }
    }
    return out;
  }, [usage]);

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

  // Docs cross-reference each other with relative .md links (e.g.
  // "../helpers/contract.next.md"). Resolve them to reference entries and
  // open them inside the panel instead of navigating to a non-existent URL.
  const resolveDocLink = useCallback(
    (href: string): DocLinkResolution => {
      const resolved = resolveDocLinkEntry(href, selectedItem?.module);
      if (resolved === null) return null;
      if (resolved === "unresolved") return "plain";
      return () => {
        lastCursorKeyRef.current = null;
        openEntry(resolved);
      };
    },
    [selectedItem, openEntry],
  );

  const detailMarkdownComponents = useMemo(
    () => createMarkdownComponents(resolveDocLink),
    [resolveDocLink],
  );

  const handleBack = useCallback(() => {
    setSelectedItem(null);
    setMarkdownContent(null);
    // Keep lastCursorKeyRef so we don't immediately re-open the same item
  }, []);

  // Auto-open detail when cursor moves to a recognized command/helper
  useEffect(() => {
    // Cursor moved away from any entry
    if (!cursorRef) {
      lastCursorKeyRef.current = null;
      return;
    }

    const entry = resolveCursorEntry(cursorRef, usage);
    if (!entry) return;

    const cursorKey = `${entry.kind}:${entry.module}:${entry.name}`;
    // Same entry as before — don't re-trigger
    if (cursorKey === lastCursorKeyRef.current) return;

    lastCursorKeyRef.current = cursorKey;
    terminalStoreActions("activeTab", "reference");
    openEntry(entry);
  }, [cursorRef, usage, openEntry]);

  // Detail view
  if (selectedItem) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-2 py-2 shrink-0">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to list
          </button>
        </div>
        <div className="px-2 py-2 shrink-0">
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
        <div
          key={`${selectedItem.kind}:${selectedItem.module}:${selectedItem.name}`}
          className="flex-1 overflow-y-auto px-2 pb-4"
        >
          {markdownContent === null ? (
            <p className="text-foreground/40 text-sm">Loading...</p>
          ) : markdownContent === "" ? (
            <p className="text-foreground/40 text-base">
              {selectedItem.description}
            </p>
          ) : (
            <div className="prose prose-invert prose-base max-w-none leading-tight prose-p:leading-tight prose-li:leading-tight prose-headings:leading-tight prose-headings:text-foreground prose-h1:text-2xl prose-h2:text-xl prose-h2:text-evm-green-300 prose-h2:border-b prose-h2:border-foreground/10 prose-h2:pb-1 prose-h3:text-lg prose-strong:text-foreground prose-code:text-evm-orange-300 prose-code:bg-foreground/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-pre:bg-foreground/5 prose-pre:border prose-pre:border-foreground/10 prose-pre:rounded-md prose-th:text-foreground/70 prose-td:text-foreground/80 prose-li:text-foreground/80 prose-hr:border-foreground/10">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={detailMarkdownComponents}
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
      <div className="px-2 py-4 shrink-0">
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
      <div className="overflow-y-auto overflow-x-hidden flex-1 px-2">
        {(usedEntries.length > 0 || usedConfigs.length > 0) && (
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
              {usedConfigs.map(({ mod, entry }) => (
                <ConfigRow
                  key={`used-${mod}-cfg-${entry.name}`}
                  mod={mod}
                  entry={entry}
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
            {moduleConfigs.has(mod) &&
              moduleConfigs
                .get(mod)!
                .map((c) => (
                  <ConfigRow key={`${mod}-cfg-${c.name}`} mod={mod} entry={c} />
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
