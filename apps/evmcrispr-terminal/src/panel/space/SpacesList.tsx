import { Button, EmptyState, Input } from "@repo/ui";
import { Plus } from "@repo/ui/icons";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { useMaybeSpace } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import { Confirm, LeftBehind } from "./Confirm";
import { useHeaderAction } from "./HeaderAction";
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
  const headerAction = useHeaderAction();
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
      <div className="flex shrink-0 items-center gap-2.5 p-2.5">
        <Input
          variant="search"
          placeholder="Search"
          aria-label="Search spaces"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {headerAction}
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="shrink-0"
          onClick={() => {
            // The route makes, or reuses, the placeholder space.
            navigate("/");
            setUi({ spaceView: "timeline" });
          }}
        >
          <Plus data-icon aria-hidden />
          New
        </Button>
      </div>
      <ul
        aria-label="Spaces"
        className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto px-2.5 pt-0.5 pb-3"
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
          <li>
            <EmptyState>
              {index.length === 0 ? "No spaces yet." : "No space matches."}
            </EmptyState>
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
