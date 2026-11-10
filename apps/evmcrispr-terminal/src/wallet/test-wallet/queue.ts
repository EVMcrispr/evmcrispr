// The test wallet's requests waiting for the user's word, one at a time:
// the panel shows the first; Approve or Reject answers it and shows the next.
import type { SigningRequest } from "@evmcrispr/dev-wallet";

interface Pending {
  request: SigningRequest;
  answer: (approved: boolean) => void;
}

export interface SigningQueue {
  /** What the wallet calls: resolves with the user's answer. */
  ask(request: SigningRequest): Promise<boolean>;
  current(): SigningRequest | undefined;
  /** Answers `request` if it is still the one shown; a late second click
   *  meant for it answers nothing. */
  answer(request: SigningRequest, approved: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createSigningQueue(): SigningQueue {
  const pending: Pending[] = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const l of listeners) l();
  };
  return {
    ask: (request) =>
      new Promise<boolean>((answer) => {
        pending.push({ request, answer });
        changed();
      }),
    current: () => pending[0]?.request,
    answer(request, approved) {
      if (pending[0]?.request !== request) return;
      const first = pending.shift()!;
      first.answer(approved);
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
