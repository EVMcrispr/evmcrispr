import type { BoxSnapshot } from "@evmcrispr/sdk";

export type ConsoleEntry =
  | { kind: "line"; text: string }
  | { kind: "box"; box: BoxSnapshot; children: ConsoleEntry[] };

type Slot = { kind: "line"; text: string } | { kind: "box"; id: string };

export interface ConsoleState {
  slots: Slot[];
  boxes: Record<string, BoxSnapshot>;
  live: number;
}

export type ConsoleEvent =
  | { kind: "line"; text: string; box?: string }
  | { kind: "box"; snapshot: BoxSnapshot }
  /** The run died without ending its boxes (e.g. its worker was killed):
   *  every box still live ends cancelled with `detail`. */
  | { kind: "end-live"; detail: string };

export const emptyConsole: ConsoleState = { slots: [], boxes: {}, live: 0 };

/** Lines tagged with a known box id are dropped: the box itself shows them.
 *  Core emits a box's snapshot before its tagged line, so a tagged line whose
 *  box never arrived comes from a host without `onBox` and stays as text. */
export function reduceConsole(
  state: ConsoleState,
  event: ConsoleEvent,
): ConsoleState {
  if (event.kind === "line")
    return event.box && event.box in state.boxes
      ? state
      : {
          ...state,
          slots: [...state.slots, { kind: "line", text: event.text }],
        };
  if (event.kind === "end-live") {
    if (state.live === 0) return state;
    const boxes = Object.fromEntries(
      Object.entries(state.boxes).map(([id, box]) => [
        id,
        box.state === "live"
          ? {
              ...box,
              state: "cancelled" as const,
              detail: event.detail,
              history:
                box.detail && box.detail !== event.detail
                  ? [...box.history, box.detail]
                  : box.history,
            }
          : box,
      ]),
    );
    return { ...state, boxes, live: 0 };
  }
  const { snapshot } = event;
  const known = snapshot.id in state.boxes;
  const boxes = { ...state.boxes, [snapshot.id]: snapshot };
  const slots = known
    ? state.slots
    : [...state.slots, { kind: "box" as const, id: snapshot.id }];
  const live = Object.values(boxes).filter((b) => b.state === "live").length;
  return { slots, boxes, live };
}

/** Top-level entries in order. A box with a parent renders inside it; the
 *  parent takes the slot of whichever of them appeared first. */
export function consoleEntries(state: ConsoleState): ConsoleEntry[] {
  const parentOf = (id: string): string | undefined => {
    const parent = state.boxes[id]?.parent;
    return parent && parent !== id && state.boxes[parent] ? parent : undefined;
  };
  const children = new Map<string, string[]>();
  for (const slot of state.slots) {
    if (slot.kind !== "box") continue;
    const parent = parentOf(slot.id);
    if (parent)
      children.set(parent, [...(children.get(parent) ?? []), slot.id]);
  }
  const rootOf = (id: string): string => {
    const seen = new Set<string>([id]);
    let current = id;
    for (;;) {
      const parent = parentOf(current);
      if (!parent || seen.has(parent)) return current;
      seen.add(parent);
      current = parent;
    }
  };
  // `built` guards against parent cycles, which would otherwise recurse forever.
  const built = new Set<string>();
  const build = (id: string): ConsoleEntry => {
    built.add(id);
    return {
      kind: "box",
      box: state.boxes[id],
      children: (children.get(id) ?? [])
        .filter((child) => !built.has(child))
        .map(build),
    };
  };
  const placed = new Set<string>();
  const entries: ConsoleEntry[] = [];
  for (const slot of state.slots) {
    if (slot.kind === "line") {
      entries.push(slot);
      continue;
    }
    const root = rootOf(slot.id);
    if (placed.has(root) || built.has(root)) continue;
    placed.add(root);
    entries.push(build(root));
  }
  return entries;
}
