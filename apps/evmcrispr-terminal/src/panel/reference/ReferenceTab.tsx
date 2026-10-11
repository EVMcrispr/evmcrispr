import {
  collectScriptUsage,
  type HoverRef,
  type ScriptUsage,
} from "@evmcrispr/core";
import {
  BackButton,
  Badge,
  EmptyState,
  Input,
  PanelHeader,
  Row,
} from "@repo/ui";
import { FlaskConical } from "@repo/ui/icons";
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
import { useMaybeSpace, useSpaceText } from "../../app/SpaceContext";
import { setUi, useUi } from "../../app/ui-store";
import {
  type ConfigEntry,
  experimentalModules,
  moduleConfigs,
  moduleNames,
  type ReferenceEntry,
  referenceEntries,
  resolveDocLinkEntry,
} from "../../data/reference-data";
import { useFocusOnTab } from "../../hooks/useFocusOnTab";
import {
  createMarkdownComponents,
  type DocLinkResolution,
  rehypeExperimentalFlask,
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
      title={
        entry.default
          ? `${entry.description} Default: ${entry.default}`
          : entry.description
      }
    >
      <Row
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-fg">
              ${mod}:{entry.name}
            </span>
            <Badge tone="success">config</Badge>
            <Badge>{entry.type}</Badge>
            {mod !== "std" && <Badge>{mod}</Badge>}
          </span>
        }
        meta={<span className="truncate">{entry.description}</span>}
      />
    </div>
  );
}

const PROSE =
  "prose prose-invert prose-base max-w-none leading-tight prose-p:leading-tight prose-li:leading-tight prose-headings:leading-tight prose-headings:text-fg prose-h1:text-display prose-h2:text-title prose-h2:text-heading prose-h2:border-b-2 prose-h2:border-line prose-h2:pb-1 prose-h3:text-title prose-strong:text-fg prose-code:text-unverified prose-code:bg-surface-active prose-code:px-1 prose-code:py-0.5 prose-code:text-caption prose-code:before:content-none prose-code:after:content-none prose-pre:bg-surface-well prose-pre:border-2 prose-pre:border-line prose-th:text-fg-muted prose-td:text-fg-muted prose-li:text-fg-muted prose-hr:border-line";

const GROUP =
  "m-0 flex items-center gap-1.5 px-1 py-1 font-head text-caption uppercase";

/** Lookup map: (kind + module + name) -> ReferenceEntry. */
const entryByKey = new Map<string, ReferenceEntry>(
  referenceEntries.map((e) => [`${e.kind}:${e.module}:${e.name}`, e]),
);

/** Resolve a hover/docs ref to its entry: explicit `mod:` prefix wins, then
 *  the script's load-import bindings (honoring `>` renames), then std — the
 *  same order the semantic analyzer uses. Falls back to any module defining
 *  the name so a bare match still opens something while the load line is
 *  absent or mid-edit. */
function resolveCursorEntry(
  ref: HoverRef,
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
  // Mounted also while a space loads: no script then.
  const script = useSpaceText(useMaybeSpace());
  const docsRequest = useUi((s) => s.docsRequest);
  const [query, setQuery] = useState("");
  const searchRef = useFocusOnTab<HTMLInputElement>("reference");
  const [selectedItem, setSelectedItem] = useState<ReferenceEntry | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  // Track the last opened request's nonce so the same docsRequest object
  // (e.g. re-rendered with unrelated store updates) doesn't re-trigger.
  const lastRequestTsRef = useRef<number | null>(null);

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
  }, []);

  // Open the detail view when the user explicitly asks to see docs for a
  // command/helper — clicking "Open in reference" in a hover card (desktop
  // edit mode) or the equivalent button in the view-mode/mobile hover
  // popover. The `ts` nonce lets the same entry be re-requested (e.g. the
  // user navigated away and re-clicks the same hover link).
  useEffect(() => {
    if (!docsRequest) return;
    if (docsRequest.ts === lastRequestTsRef.current) return;
    lastRequestTsRef.current = docsRequest.ts;

    const entry = resolveCursorEntry(docsRequest, usage);
    if (!entry) return;

    setUi({ activeTab: "reference" });
    openEntry(entry);
  }, [docsRequest, usage, openEntry]);

  // Detail view
  if (selectedItem) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader
          back={<BackButton label="Reference" onClick={handleBack} />}
          title={
            selectedItem.kind === "helper"
              ? `@${selectedItem.name}`
              : selectedItem.name
          }
          actions={
            <>
              <Badge
                variant="tag"
                tone={selectedItem.kind === "command" ? "info" : "warning"}
              >
                {selectedItem.kind === "command" ? "command" : "helper"}
              </Badge>
              <Badge variant="tag">{selectedItem.module}</Badge>
            </>
          }
        />
        <div
          key={`${selectedItem.kind}:${selectedItem.module}:${selectedItem.name}`}
          className="flex-1 overflow-y-auto px-3 pt-3 pb-4"
        >
          {markdownContent === null ? (
            <p className="m-0 font-sans text-body text-fg-faint">Loading...</p>
          ) : markdownContent === "" ? (
            <p className="m-0 font-sans text-body text-fg-muted">
              {selectedItem.description}
            </p>
          ) : (
            <div className={PROSE}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeExperimentalFlask]}
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
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-2">
        <Input
          ref={searchRef}
          variant="search"
          placeholder="Search commands & helpers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-2 pb-3">
        {(usedEntries.length > 0 || usedConfigs.length > 0) && (
          <div className="flex flex-col gap-1.5">
            <h3 className={`${GROUP} text-heading`}>Used in Script</h3>
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
        )}
        {[...entriesByModule.entries()].map(([mod, entries]) => (
          <div key={mod} className="flex flex-col gap-1.5">
            <h3 className={`${GROUP} text-fg-faint`}>
              {mod}
              {experimentalModules.has(mod) && (
                <span title="Experimental" className="shrink-0">
                  <FlaskConical aria-hidden className="size-3.5" />
                </span>
              )}
            </h3>
            {entries.map((e) => (
              <ReferenceItem
                key={`${mod}-${e.kind}-${e.name}`}
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
          <EmptyState>No matches found.</EmptyState>
        )}
      </div>
    </div>
  );
}
