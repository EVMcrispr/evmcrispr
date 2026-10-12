import {
  collectScriptUsage,
  type HoverRef,
  type ScriptUsage,
} from "@evmcrispr/core";
import {
  BackButton,
  Badge,
  cn,
  EmptyState,
  IconButton,
  Input,
  PanelHeader,
  Row,
} from "@repo/ui";
import { BookOpen, ExternalLink, FlaskConical } from "@repo/ui/icons";
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
import { DOCS_URL, docsPage, SITE_URL } from "../../data/site";
import { useFocusOnTab } from "../../hooks/useFocusOnTab";
import {
  createMarkdownComponents,
  type DocLinkResolution,
  PROSE,
  rehypeExperimentalFlask,
} from "./MarkdownComponents";
import { kindLabel, ReferenceItem } from "./ReferenceItem";

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
  // An on-chain face is on its helper's entry.
  const plain = bound.name.replace(/!$/, "");
  return (
    entryByKey.get(`${ref.kind}:${bound.module}:${bound.name}`) ??
    entryByKey.get(`${ref.kind}:${bound.module}:${plain}`) ??
    referenceEntries.find(
      (e) =>
        e.kind === ref.kind &&
        (e.name === ref.name || e.name === ref.name.replace(/!$/, "")),
    )
  );
}

export function ReferenceTab({
  onEntryChange,
  flush = false,
}: {
  /** Inside something that already has side padding (a sheet): the panel
   *  adds none, so its lines and its text share the same edges. */
  flush?: boolean;
  /** Told whether an entry is open: the host may then drop its own way
   *  back, since the entry has one to the list. */
  onEntryChange?(open: boolean): void;
} = {}) {
  // Mounted also while a space loads: no script then.
  const script = useSpaceText(useMaybeSpace());
  const docsRequest = useUi((s) => s.docsRequest);
  const [query, setQuery] = useState("");
  const searchRef = useFocusOnTab<HTMLInputElement>("reference");
  const [selectedItem, setSelectedItem] = useState<ReferenceEntry | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const entryOpen = selectedItem !== null;
  useEffect(() => {
    onEntryChange?.(entryOpen);
    // Gone from the screen, no entry is open.
    return () => onEntryChange?.(false);
  }, [entryOpen, onEntryChange]);
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
      filteredEntries.filter((e) => {
        const used = e.kind === "command" ? usage.commands : usage.helpers;
        return (
          used.has(`${e.module}:${e.name}`) ||
          (e.onchain === true && used.has(`${e.module}:${e.name}!`))
        );
      }),
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
  // command/helper — clicking "Open in docs" in a hover card (desktop
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
          className={flush ? "px-0 touch:px-0" : undefined}
          back={<BackButton label="Docs" onClick={handleBack} />}
          title={
            selectedItem.kind === "helper"
              ? `@${selectedItem.name}`
              : selectedItem.name
          }
          actions={
            <>
              <Badge
                variant="tag"
                tone={selectedItem.kind === "command" ? "success" : "warning"}
              >
                {kindLabel(selectedItem, true)}
              </Badge>
              <Badge variant="tag">{selectedItem.module}</Badge>
              <IconButton
                variant="quiet"
                size="sm"
                aria-label="Open on the website"
                onClick={() =>
                  window.open(docsPage(selectedItem), "_blank", "noreferrer")
                }
              >
                <ExternalLink aria-hidden />
              </IconButton>
            </>
          }
        />
        <div
          key={`${selectedItem.kind}:${selectedItem.module}:${selectedItem.name}`}
          className={cn("flex-1 overflow-y-auto pt-3 pb-4", !flush && "px-3")}
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
      <div
        className={cn("flex shrink-0 flex-col gap-2 py-2", !flush && "px-2")}
      >
        <Input
          ref={searchRef}
          variant="search"
          placeholder="Search commands & helpers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div
        className={cn(
          // Room under the last entry for the card that stays over the list.
          "flex flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pb-16",
          !flush && "px-2",
        )}
      >
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
            <h3 className={`${GROUP} text-success`}>
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
      {/* Where to read more: it stays at the foot of the list, on a fade
          of the surface behind it, so it is not taken for an entry. */}
      <div
        className={cn(
          // Sticky, not absolute: in the phone's sheet it is the sheet
          // that scrolls, and the card stays at its foot all the same.
          "pointer-events-none sticky z-10 -mt-12 shrink-0 bg-linear-to-t via-65% to-transparent pt-12",
          flush
            ? // Down to the sheet's edge, over the padding under the list.
              "-bottom-3 from-surface-sheet via-surface-sheet pb-5"
            : "bottom-0 from-background via-background px-2 pb-2",
        )}
      >
        <Row
          className="pointer-events-auto"
          href={DOCS_URL}
          active
          emphasis="title"
          leading={<BookOpen aria-hidden className="size-4 text-heading" />}
          title="Guides and the full docs"
          meta={new URL(SITE_URL).host}
          actions={
            <ExternalLink aria-hidden className="mr-2 size-4 text-heading" />
          }
        />
      </div>
    </div>
  );
}
