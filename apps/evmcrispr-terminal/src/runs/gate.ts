export type HoldReason = "left" | "declined";
export type HoldStatus = "waiting" | "paused" | "declined";

/** The action a paused run is holding. */
export interface Held<Action> {
  action: Action;
  reason: HoldReason;
  since: number;
}

export interface Gate<Action> {
  /** Passes one wallet-reaching action to `send`. Holds it first while the
   *  run's space is off screen, and again after a refusal in the wallet;
   *  the interpreter keeps waiting and sees nothing of either.
   *
   *  `send` may be called more than once, so it reports `sent` as soon as
   *  anything has gone out: from then on no error is a refusal, and the
   *  action is never sent a second time. */
  pass<T>(
    action: Action,
    send: (sent: () => void) => Promise<T>,
    status: (state: HoldStatus) => void,
  ): Promise<T>;
  /** Whether a wallet request may go out at this very moment: a pass is
   *  under way, the space is on screen and the gate is open. Asked where
   *  the request is made, so nothing slips out between the gate's own
   *  check and the wallet. */
  allows(): boolean;
  held(): Held<Action> | null;
  /** Passes the held action to the wallet (again). */
  resume(): void;
  /** Closes the gate for good: nothing reaches the wallet after it. A held
   *  refusal is handed to the script as it would have been; an action held
   *  for leaving is cancelled. */
  cancel(): void;
}

export const CANCELLED = "Execution cancelled";

/** The whole of pausing: one place decides whether a wallet request may go
 *  out. It knows nothing about runs, workers or wallets. */
export function createGate<Action>(options: {
  onScreen(): boolean;
  /** A deliberate refusal of the wallet request itself (EIP-1193 code
   *  4001), as the host saw the wallet answer it. */
  isRefusal(error: unknown): boolean;
  /** A request that was not made because `allows()` said no. */
  isHeldBack(error: unknown): boolean;
  now(): number;
  onChange(held: Held<Action> | null): void;
}): Gate<Action> {
  let closed = false;
  /** A `send` is under way. */
  let passing = false;
  let current: (Held<Action> & { release(): void; fail(): void }) | null = null;

  const hold = (action: Action, reason: HoldReason, refusal?: unknown) =>
    new Promise<void>((release, reject) => {
      const held = { action, reason, since: options.now() };
      current = {
        ...held,
        release,
        fail: () => reject(refusal ?? new Error(CANCELLED)),
      };
      options.onChange(held);
    }).finally(() => {
      current = null;
      options.onChange(null);
    });

  // One action at a time, whatever the script does: a hold, a refusal
  // and "was it sent" each belong to exactly one pass.
  let last: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(pass: () => Promise<T>): Promise<T> => {
    const turn = last.then(pass, pass);
    last = turn.catch(() => {});
    return turn;
  };

  return {
    pass: (action, send, status) =>
      inTurn(async () => {
        for (;;) {
          if (closed) throw new Error(CANCELLED);
          if (!options.onScreen()) {
            status("paused");
            await hold(action, "left");
            continue;
          }
          status("waiting");
          let wasSent = false;
          passing = true;
          try {
            return await send(() => {
              wasSent = true;
            });
          } catch (error) {
            passing = false;
            // Asked again only when nothing went out: an error after a
            // send is the script's to hear, whatever it looks like.
            if (closed || wasSent) throw error;
            // The user left before the request was made: held like any
            // action of a space that is off screen.
            if (options.isHeldBack(error) && !options.onScreen()) continue;
            if (!options.isRefusal(error)) throw error;
            status("declined");
            await hold(action, "declined", error);
          } finally {
            passing = false;
          }
        }
      }),
    allows: () => passing && !closed && options.onScreen(),
    held: () =>
      current && {
        action: current.action,
        reason: current.reason,
        since: current.since,
      },
    resume: () => current?.release(),
    cancel() {
      closed = true;
      current?.fail();
    },
  };
}
