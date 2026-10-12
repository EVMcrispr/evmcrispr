import type { OpenChannel } from "./channel";

/** A private or index record changed. Views re-read it from storage.
 *  `history` is not a record: it says a space's undo histories were let
 *  go of (`LiveSpace.forgetHistory`), for every tab to do the same. */
export interface Change {
  store: "spaces" | "markers" | "chats" | "prefs" | "history";
  key: string;
}

export interface Changes {
  /** Tells this tab's views and every other tab. */
  announce(change: Change): void;
  /** `local` is true for what this tab announced itself. */
  subscribe(listener: (change: Change, local: boolean) => void): () => void;
}

export function createChanges(open: OpenChannel): Changes {
  const channel = open("evmcrispr");
  const listeners = new Set<(change: Change, local: boolean) => void>();
  const emit = (change: Change, local: boolean) => {
    for (const listener of [...listeners]) listener(change, local);
  };
  channel.addEventListener("message", (event) =>
    emit(event.data as Change, false),
  );
  return {
    announce(change) {
      emit(change, true);
      channel.postMessage(change);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
