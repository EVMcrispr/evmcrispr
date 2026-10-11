import { PlusIcon } from "@heroicons/react/24/solid";
import { Button, Input } from "@repo/ui";
import { Search } from "@repo/ui/icons";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { useMaybeSpace } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import { Confirm, LeftBehind } from "./Confirm";
import { SpaceRow } from "./SpaceRow";

/** A title as the search compares it. */
const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");

/** Every space of this browser, with what goes on inside each. */
export function SpacesList() {
  const { spaces } = useApp();
  const index = useStore(spaces.index);
  const current = useMaybeSpace()?.id;
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const doomed = index.find((meta) => meta.id === removing);

  const shown = useMemo(() => {
    const q = slug(query);
    return q ? index.filter(({ title }) => slug(title).includes(q)) : index;
  }, [index, query]);

  const open = (id: string) => {
    if (id !== current) navigate(`/${id}`);
    setUi({ spaceView: "timeline" });
  };

  const remove = async (id: string) => {
    // Removing the space on screen: another one takes its place first, so
    // nothing is shown of a space that is going away.
    if (id === current) {
      const next = index.find((meta) => meta.id !== id);
      navigate(next ? `/${next.id}` : "/", { replace: true });
    }
    await spaces.remove(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-2 py-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/45" />
          <Input
            placeholder="Search"
            aria-label="Search spaces"
            className="h-10 border border-evm-gray-800 pl-10 text-sm transition-colors hover:border-primary focus:border-primary focus:ring-0"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1.5 shadow-none"
          onClick={() => {
            // The route makes, or reuses, the placeholder space.
            navigate("/");
            setUi({ spaceView: "timeline" });
          }}
        >
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>
      <ul
        aria-label="Spaces"
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-3"
      >
        {shown.map((meta) => (
          <SpaceRow
            key={meta.id}
            meta={meta}
            active={meta.id === current}
            onOpen={open}
            onRemove={setRemoving}
          />
        ))}
        {shown.length === 0 && (
          <li className="px-2 font-sans text-sm text-muted-foreground">
            {index.length === 0 ? "No spaces yet." : "No space matches."}
          </li>
        )}
      </ul>
      {doomed && (
        <Confirm
          title="Remove this space"
          action="Remove space"
          onConfirm={() => void remove(doomed.id)}
          onClose={() => setRemoving(null)}
        >
          <p>
            This removes “{doomed.title}” from this browser, for good: its
            script, its revisions and its runs.
            {doomed.run && " A run of it is going on, and will be stopped."}
          </p>
          <p>
            Undo and everything this browser stored of it go with it, in every
            tab. Your other spaces are not touched.
          </p>
          <LeftBehind action="removeSpace" />
        </Confirm>
      )}
    </div>
  );
}
