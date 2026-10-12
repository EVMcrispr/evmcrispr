import { Button, EmptyState, IconButton, Input } from "@repo/ui";
import { MessagesSquare, Plus } from "@repo/ui/icons";
import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { useStore } from "zustand";
import { useApp } from "../../app/AppContext";
import { DISPLACED, measureDisplacement, morph } from "../../app/morph";
import { useMaybeSpace } from "../../app/SpaceContext";
import { setUi } from "../../app/ui-store";
import { Confirm, LeftBehind } from "./Confirm";
import { useToChat } from "./HeaderAction";
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
  const toChat = useToChat();
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

  // The row that opens is the one that turns into its space; until one
  // is chosen, the space on screen is what came back to its row.
  const [opening, setOpening] = useState<string | null>(null);
  const morphing = opening ?? current;
  const at = shown.findIndex((meta) => meta.id === morphing);
  const part = (index: number) =>
    at < 0 ? undefined : index === at ? "self" : index < at ? "above" : "below";

  // How far that row's edges are from the panel's: what it pushes away
  // moves as far. Known before the list is first painted, for the way
  // back from a space, and again when a row is chosen.
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const measure = () => {
    const row = at < 0 ? null : list.current?.children[at];
    if (row && panel.current) measureDisplacement(row, panel.current);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arriving
  useLayoutEffect(measure, []);

  const open = (id: string) => {
    flushSync(() => setOpening(id));
    const row = list.current?.children[shown.findIndex((m) => m.id === id)];
    if (row && panel.current) measureDisplacement(row, panel.current);
    morph(
      () => {
        if (id !== current) navigate(`/${id}`);
        setUi({ spaceView: "timeline" });
      },
      // Another space takes a moment to load.
      () => document.querySelector(`[data-timeline-of="${id}"]`) !== null,
    );
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
    <div ref={panel} className="flex h-full flex-col">
      <div
        // The search goes the way of the rows above the one that opens.
        style={
          {
            viewTransitionName: "spaces-head",
            viewTransitionClass: DISPLACED.above,
          } as CSSProperties
        }
        className="flex shrink-0 items-center gap-2.5 p-2.5"
      >
        {/* On a phone the list was come to from the chat. */}
        {toChat && (
          <IconButton
            type="button"
            variant="quiet"
            size="sm"
            aria-label="Back to chat"
            onClick={toChat}
          >
            <MessagesSquare aria-hidden />
          </IconButton>
        )}
        <Input
          variant="search"
          placeholder="Search"
          aria-label="Search spaces"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
          New space
        </Button>
      </div>
      <ul
        ref={list}
        aria-label="Spaces"
        className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto px-2.5 pt-0.5 pb-3"
      >
        {shown.map((meta, index) => (
          <SpaceRow
            key={meta.id}
            meta={meta}
            active={meta.id === current}
            part={part(index)}
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
