import type { BoxSnapshot } from "@evmcrispr/sdk";

export type ConsoleEntry =
  | { kind: "line"; text: string }
  | { kind: "box"; box: BoxSnapshot };

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

/** Entries in the order they first appeared. Boxes stay flat: a box's
 *  `parent` (the transaction or proposal carrying it) decides which box ends
 *  after which, and is not shown. */
export function consoleEntries(state: ConsoleState): ConsoleEntry[] {
  return state.slots.map((slot) =>
    slot.kind === "line" ? slot : { kind: "box", box: state.boxes[slot.id] },
  );
}
