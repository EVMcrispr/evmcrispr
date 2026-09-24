import type { Action } from "./actions";

/** How an action ended, once it (or whatever carries it) was sent. */
export type ActionOutcome =
  | { kind: "confirmed"; receipt?: unknown }
  | { kind: "reverted"; reason: string }
  | { kind: "rejected"; reason: string }
  | { kind: "replaced"; reason: string }
  | { kind: "failed"; reason: string }
  /** Never sent: a dry run, or the run ended before the host sent it. */
  | { kind: "not-sent"; reason: string }
  /** Sent or queued (a Safe App batch, a host that returned no receipt),
   *  but how it ended is not known. */
  | { kind: "unknown"; reason: string };

export type BoxState = "live" | "done" | "failed" | "cancelled";

/** One step of a box's progress, for hosts that draw a step per segment:
 *  `done` (with an optional link to what completed it), `missed` (its time
 *  passed without it completing), `open` (its time is running and it has
 *  not completed) or `pending` (not reached yet). `current` marks the step
 *  whose time is running, done early or not: hosts grow its segment with
 *  the countdown's time. */
export interface BoxStep {
  state: "done" | "missed" | "open" | "pending";
  href?: string;
  current?: boolean;
}

/** Time left until the box's next step, which hosts can show ticking:
 *  `label` and the time left ("Next settlement in 4m 12s"), then `due`
 *  once `until` has passed. Times are Unix seconds. `segment` is the step
 *  (zero-based, out of `progress[1]`) the countdown leads to, which fills
 *  from `from` to `until`. */
export interface BoxCountdown {
  label: string;
  due?: string;
  from: number;
  until: number;
  segment?: number;
}

/** Everything a host needs to render a box. Structured-cloneable. */
export interface BoxSnapshot {
  id: string;
  parent?: string;
  state: BoxState;
  title: string;
  detail: string;
  /** Earlier details, oldest first. */
  history: string[];
  progress?: [number, number];
  links?: Record<string, string>;
  countdown?: BoxCountdown;
  /** Each step's state, in order: hosts draw one segment per step and
   *  link the done ones that carry an `href`. */
  steps?: BoxStep[];
  simulated: boolean;
}

export interface BoxUpdate {
  detail?: string;
  progress?: [number, number];
  links?: Record<string, string>;
  /** `null` clears it. */
  countdown?: BoxCountdown | null;
  steps?: BoxStep[];
}

export interface BoxOptions {
  title: string;
  detail?: string;
  /** Actions whose outcome `watch` waits for; also decides the parent box. */
  follows?: Action[];
  /** Keep the run open while live, even without a `watch`. */
  holds?: boolean;
  /** Not shown until `reveal()`: no snapshot or log line before, so the
   *  box appears where and when it is revealed. A hidden box that ends is
   *  never shown. */
  hidden?: boolean;
  /** With `follows`: hidden until those actions are confirmed, through
   *  whatever carries them, then shown on its own (after the carrier's
   *  box); never shown if they are not. By default a box shows at once,
   *  while its carrier is still live. */
  showWhenConfirmed?: boolean;
  links?: Record<string, string>;
}

export interface WatchContext {
  outcome: ActionOutcome;
  signal: AbortSignal;
  simulated: boolean;
}

export interface BoxHandle {
  readonly id: string;
  /** Aborted on cancel, on script failure and when the box ends. */
  readonly signal: AbortSignal;
  readonly simulated: boolean;
  update(update: BoxUpdate): void;
  done(detail: string): void;
  fail(detail: string): void;
  /** Ends the box cancelled (⊘): what it followed was cancelled or it
   *  stopped following, without failing. */
  cancel(detail: string): void;
  /** Show a box opened `hidden`, as it is now. */
  reveal(): void;
  /** Runs once `follows` settles. Holds the run in real execution. */
  watch(fn: (ctx: WatchContext) => Promise<void>): void;
  /** Calls `step` every `every` ms until it returns "stop" or the box
   *  ends. A throwing step shows "Reconnecting…" and retries with
   *  doubling backoff up to `maxBackoff` (default 5 minutes). */
  poll(
    step: () => Promise<"continue" | "stop">,
    options: { every: number; maxBackoff?: number },
  ): Promise<void>;
}

/** Reported by a host while it sends an action. */
export interface ActionReport {
  sent(hash: `0x${string}`): void;
}

export type BoxOpener = (options: BoxOptions) => BoxHandle;

/** For wrappers that send nothing themselves (e.g. `safe:propose`): the
 *  inner actions' outcome is `outcome`, shown under `box`. */
export type Carrier = (
  inner: Action[],
  outcome: Promise<ActionOutcome>,
  box?: BoxHandle,
) => void;
