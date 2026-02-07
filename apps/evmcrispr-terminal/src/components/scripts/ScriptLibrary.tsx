import { FolderIcon, FolderOpenIcon } from "@heroicons/react/24/solid";
import { Drawer, IconButton, Input } from "@repo/ui";
import { Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { StoredScript } from "../../types/index";
import { getScriptList, removeScriptFromLocalStorage, slug } from "../../utils";
import { LibraryButton } from "./LibraryButton";
import { SavedScript } from "./SavedScript";

export default function ScriptLibrary() {
  const [scripts, setScripts] = useState<StoredScript[]>(getScriptList());
  const [filteredScripts, setFilteredScripts] =
    useState<StoredScript[]>(scripts);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function filterScripts(scripts: StoredScript[], query: string): void {
    const filteredScripts = scripts.filter(({ title }) =>
      slug(title).includes(slug(query)),
    );
    setQuery(query);
    setFilteredScripts(filteredScripts);
  }

  const handleItemClick = (title: string) => {
    setIsOpen(false);
    navigate(`/${slug(title)}`);
  };

  const handleItemRemove = (title: string) => {
    removeScriptFromLocalStorage(title);
    const initialScripts = getScriptList();
    setScripts(initialScripts);
    filterScripts(initialScripts, query);
  };

  return (
    <div className="relative">
      <div
        className={`hidden sm:block transition-opacity duration-200 ${isOpen ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto delay-300"}`}
      >
        <LibraryButton
          className="fixed z-51 right-0"
          icon={FolderIcon}
          onClick={() => {
            const initialScripts = getScriptList();
            setScripts(initialScripts);
            filterScripts(initialScripts, query);
            setIsOpen(true);
          }}
        />
      </div>
      <Drawer
        open={isOpen}
        onOpenChange={setIsOpen}
        direction="right"
        modal={true}
      >
        <Drawer.Content className="bg-evm-gray-900 border-l-2 border-evm-green-300 overflow-visible">
          <div className="hidden sm:block">
            <LibraryButton
              className="absolute right-[calc(100%+2px)] top-[calc(20vh-2px)]"
              icon={FolderOpenIcon}
              onClick={() => setIsOpen(false)}
            />
          </div>
          <Drawer.Close className="absolute top-3 right-3 text-white cursor-pointer">
            <span className="text-3xl">&times;</span>
          </Drawer.Close>
          <div className="py-6 px-4">
            <div className="flex flex-col gap-4">
              <div className="flex justify-center items-center gap-4">
                <h2 className="text-white text-4xl font-head font-bold">
                  Library
                </h2>
              </div>
              <div className="relative">
                <Input
                  placeholder="Search"
                  className="text-lg pr-10 border"
                  value={query}
                  onChange={(e) => filterScripts(scripts, e.target.value)}
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
                <p className="text-2xl text-evm-yellow-300 font-head">
                  No scripts saved yet.
                </p>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer>
    </div>
  );
}
