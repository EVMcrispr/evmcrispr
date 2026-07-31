import { cn, IconButton, Input } from "@repo/ui";
import { Search } from "@repo/ui/icons";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { flushAutoSave } from "../../hooks/useAutoSave";
import { disposeModel } from "../../hooks/useEditorModels";
import { useFocusOnTab } from "../../hooks/useFocusOnTab";
import { useLibraryStore } from "../../stores/library-store";
import { useTerminalStore } from "../../stores/terminal-store";
import { removeScript, slug } from "../../utils";
import { SavedScript } from "../scripts/SavedScript";

export function LibraryTab({
  onNavigate,
  mobile = false,
}: {
  onNavigate?: () => void;
  mobile?: boolean;
} = {}) {
  const scripts = useLibraryStore((s) => s.scripts);
  const { currentScriptId, title: liveTitle, isSaving } = useTerminalStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const searchRef = useFocusOnTab<HTMLInputElement>("library");

  const filteredScripts = useMemo(() => {
    const q = slug(query);
    return q ? scripts.filter(({ title }) => slug(title).includes(q)) : scripts;
  }, [scripts, query]);

  const handleItemClick = (id: string) => {
    if (id === currentScriptId) return;
    flushAutoSave();
    navigate(`/${id}`);
    onNavigate?.();
  };

  const handleItemRemove = (id: string) => {
    disposeModel(id);
    removeScript(id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className={cn("px-2 py-4 shrink-0", mobile && "px-0 py-2")}>
        <div className="relative">
          <Input
            ref={searchRef}
            placeholder="Search"
            className={cn("text-base pr-10 border", mobile && "h-10 text-sm")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {mobile ? (
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-foreground/45" />
          ) : (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <IconButton
                aria-label="Search scripts"
                size="sm"
                variant="primary"
                className="shadow-none hover:shadow-none active:shadow-none hover:translate-y-0 active:translate-y-0"
              >
                <Search className="w-4 h-4" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className={cn("h-full overflow-y-auto", mobile ? "px-0" : "px-2")}>
          <div className={cn("flex flex-col", !mobile && "gap-2")}>
            {filteredScripts.length > 0 ? (
              filteredScripts.map((s) => (
                <SavedScript
                  script={s}
                  isActive={s.id === currentScriptId}
                  isSaving={s.id === currentScriptId && isSaving}
                  liveTitle={s.id === currentScriptId ? liveTitle : undefined}
                  mobile={mobile}
                  onItemClick={handleItemClick}
                  onItemRemove={handleItemRemove}
                  key={s.id}
                />
              ))
            ) : (
              <p
                className={
                  mobile
                    ? "px-2 font-sans text-sm text-muted-foreground"
                    : "text-lg text-evm-yellow-300 font-head px-2"
                }
              >
                No scripts saved yet.
              </p>
            )}
          </div>
        </div>
        {/* Fade hints that the list scrolls; matches the drawer background,
            so it vanishes over empty space. */}
        {mobile && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0b0d0c] to-transparent" />
        )}
      </div>
    </div>
  );
}
