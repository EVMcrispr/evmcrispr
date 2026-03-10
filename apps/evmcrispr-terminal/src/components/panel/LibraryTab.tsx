import { IconButton, Input } from "@repo/ui";
import { Search } from "@repo/ui/icons";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { StoredScript } from "../../types/index";
import { getScriptList, removeScriptFromLocalStorage, slug } from "../../utils";
import { SavedScript } from "../scripts/SavedScript";

export function LibraryTab() {
  const [scripts, setScripts] = useState<StoredScript[]>(getScriptList());
  const [filteredScripts, setFilteredScripts] =
    useState<StoredScript[]>(scripts);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function filterScripts(scripts: StoredScript[], query: string): void {
    const filtered = scripts.filter(({ title }) =>
      slug(title).includes(slug(query)),
    );
    setQuery(query);
    setFilteredScripts(filtered);
  }

  const handleItemClick = (title: string) => {
    navigate(`/${slug(title)}`);
  };

  const handleItemRemove = (title: string) => {
    removeScriptFromLocalStorage(title);
    const updated = getScriptList();
    setScripts(updated);
    filterScripts(updated, query);
  };

  const refreshScripts = () => {
    const updated = getScriptList();
    setScripts(updated);
    filterScripts(updated, query);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3">
        <div className="relative">
          <Input
            placeholder="Search"
            className="text-base pr-10 border"
            value={query}
            onChange={(e) => filterScripts(scripts, e.target.value)}
            onFocus={refreshScripts}
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
                onItemClick={handleItemClick}
                onItemRemove={handleItemRemove}
                key={s.title}
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
