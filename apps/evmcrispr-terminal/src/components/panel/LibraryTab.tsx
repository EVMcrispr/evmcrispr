import { IconButton, Input } from "@repo/ui";
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

export function LibraryTab() {
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
  };

  const handleItemRemove = (id: string) => {
    disposeModel(id);
    removeScript(id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-4 shrink-0">
        <div className="relative">
          <Input
            ref={searchRef}
            placeholder="Search"
            className="text-base pr-10 border"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
        </div>
      </div>
      <div className="overflow-y-auto px-2 flex-1">
        <div className="flex flex-col gap-2">
          {filteredScripts.length > 0 ? (
            filteredScripts.map((s) => (
              <SavedScript
                script={s}
                isActive={s.id === currentScriptId}
                isSaving={s.id === currentScriptId && isSaving}
                liveTitle={s.id === currentScriptId ? liveTitle : undefined}
                onItemClick={handleItemClick}
                onItemRemove={handleItemRemove}
                key={s.id}
              />
            ))
          ) : (
            <p className="text-lg text-evm-yellow-300 font-head px-2">
              No scripts saved yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
