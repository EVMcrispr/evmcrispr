import type {
  BoxCountdown,
  BoxHandle,
  BoxOptions,
  BoxSnapshot,
  BoxUpdate,
  WatchContext,
} from "@evmcrispr/sdk";
import { ErrorException } from "@evmcrispr/sdk";
import type { OutcomeRegistry } from "./outcomes";

interface BoxInput {
  outcomes: OutcomeRegistry;
  emit(snapshot: BoxSnapshot): void;
  log(message: string, box: string): void;
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
  /** Whether the run was cancelled: a watch then never starts, and its
   *  box waits for the run to end it as cancelled. */
  aborted?(): boolean;
}

type OpenOptions = BoxOptions & { simulated: boolean; realRun: () => boolean };

interface Entry {
  snapshot: BoxSnapshot;
  options: OpenOptions;
  controller: AbortController;
  holds: boolean;
  watching?: Promise<void>;
  /** Its followed actions confirmed and its watch runs (e.g. a TWAP
   *  polling its order): what it follows exists whatever the script does. */
  following?: boolean;
}

const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    // Remove the listener when the timer fires: a long poll reuses one
    // signal and would otherwise pile up a closure per iteration.
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

const sameCountdown = (a?: BoxCountdown, b?: BoxCountdown) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.label === b.label &&
    a.from === b.from &&
    a.until === b.until &&
    a.segment === b.segment);

const DEFAULT_MAX_BACKOFF = 5 * 60_000;

/** A box the run stopped following: its own work was not cancelled (a
 *  Safe proposal or a TWAP order still exists). */
export const STOPPED_FOLLOWING = "Stopped following";

/** Status boxes of one run: state, snapshots, watches and holding. */
export class BoxRegistry {
  #input: BoxInput;
  #entries = new Map<string, Entry>();
  /** Ids stay unique across runs feeding one console. */
  #prefix = crypto.randomUUID().slice(0, 8);
  #next = 0;
  #changed: (() => void)[] = [];

  constructor(input: BoxInput) {
    this.#input = input;
    input.outcomes.onChange(() => this.#reparent());
  }

  liveCount(): number {
    return [...this.#entries.values()].filter(
      (e) => e.snapshot.state === "live",
    ).length;
  }

  open(options: OpenOptions): BoxHandle {
    const id = `box-${this.#prefix}-${++this.#next}`;
    const entry: Entry = {
      snapshot: {
        id,
        state: "live",
        title: options.title,
        detail: options.detail ?? "",
        history: [],
        links: options.links,
        simulated: options.simulated,
        parent: options.follows
          ? this.#input.outcomes.parentBox(options.follows)
          : undefined,
      },
      options,
      controller: new AbortController(),
      holds: !options.simulated && options.holds === true,
    };
    this.#entries.set(id, entry);
    this.#publish(entry, true);
    const handle: BoxHandle = {
      id,
      get signal() {
        return entry.controller.signal;
      },
      simulated: options.simulated,
      update: (update) => this.#update(entry, update),
      done: (detail) => this.#end(entry, "done", detail),
      fail: (detail) => this.#end(entry, "failed", detail),
      cancel: (detail) => this.#end(entry, "cancelled", detail),
      watch: (fn) => {
        if (!options.simulated && options.realRun()) entry.holds = true;
        entry.watching = this.#runWatch(entry, fn);
      },
      poll: (step, pollOptions) => this.#poll(entry, step, pollOptions),
    };
    return handle;
  }

  /** Resolves once no holding box is live. On abort, ends live boxes as
   *  cancelled and rejects with "Execution cancelled". */
  waitForHolding(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const detach = () => {
        this.#changed = this.#changed.filter((c) => c !== check);
        signal?.removeEventListener("abort", onAbort);
      };
      const check = () => {
        const holding = [...this.#entries.values()].some(
          (e) => e.snapshot.state === "live" && e.holds && e.options.realRun(),
        );
        if (!holding) {
          detach();
          resolve();
        }
      };
      // Detach before ending boxes: ending publishes, which would run
      // `check` and resolve before the rejection.
      const onAbort = () => {
        detach();
        reject(new ErrorException("Execution cancelled"));
        this.endLive("cancelled", () => STOPPED_FOLLOWING);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#changed.push(check);
      check();
    });
  }

  endLive(
    state: "done" | "failed" | "cancelled",
    detail: (box: BoxSnapshot) => string,
  ): void {
    for (const entry of this.#entries.values())
      if (entry.snapshot.state === "live")
        this.#end(entry, state, detail(entry.snapshot));
  }

  /** The script failed: boxes whose own work already succeeded (a posted
   *  proposal, a registered order being followed) end cancelled, since
   *  what they follow still exists; the rest fail with the error. */
  stopOnFailure(message: string): void {
    for (const entry of this.#entries.values()) {
      if (entry.snapshot.state !== "live") continue;
      const succeeded =
        entry.following || (entry.options.holds && !entry.options.follows);
      if (succeeded)
        this.#end(
          entry,
          "cancelled",
          `${STOPPED_FOLLOWING}: the script failed`,
        );
      else this.#end(entry, "failed", `Script stopped: ${message}`);
    }
  }

  /** Ends live simulated boxes once their simulation is over, after a
   *  tick so watches see the outcomes that just settled. */
  async endSimulated(detail: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const entry of this.#entries.values())
      if (entry.snapshot.state === "live" && entry.snapshot.simulated)
        this.#end(entry, "done", detail);
  }

  async #runWatch(entry: Entry, fn: (ctx: WatchContext) => Promise<void>) {
    try {
      const outcome = entry.options.follows
        ? await this.#input.outcomes.outcomeOf(entry.options.follows)
        : ({ kind: "confirmed" } as const);
      if (entry.snapshot.state !== "live" || this.#input.aborted?.()) return;
      if (outcome.kind === "confirmed") entry.following = true;
      await fn({
        outcome,
        signal: entry.controller.signal,
        simulated: entry.snapshot.simulated,
      });
      if (entry.snapshot.state === "live")
        this.#end(entry, "done", entry.snapshot.detail);
    } catch (err) {
      if (entry.controller.signal.aborted) return;
      this.#end(
        entry,
        "failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async #poll(
    entry: Entry,
    step: () => Promise<"continue" | "stop">,
    {
      every,
      maxBackoff = DEFAULT_MAX_BACKOFF,
    }: { every: number; maxBackoff?: number },
  ): Promise<void> {
    const sleep = this.#input.sleep ?? abortableSleep;
    const signal = entry.controller.signal;
    let wait = every;
    while (entry.snapshot.state === "live" && !signal.aborted) {
      try {
        if ((await step()) === "stop") return;
        wait = every;
      } catch {
        if (signal.aborted) return;
        this.#update(entry, { detail: "Reconnecting…" });
        wait = Math.min(wait * 2, maxBackoff);
      }
      try {
        await sleep(wait, signal);
      } catch {
        return;
      }
    }
  }

  #update(entry: Entry, update: BoxUpdate): void {
    if (entry.snapshot.state !== "live") return;
    const previous = entry.snapshot;
    // Pollers repeat the same update every tick: only publish real changes,
    // and only log a line when the detail itself changed.
    const detailChanged =
      update.detail !== undefined && update.detail !== previous.detail;
    const progressChanged =
      update.progress !== undefined &&
      (update.progress[0] !== previous.progress?.[0] ||
        update.progress[1] !== previous.progress?.[1]);
    const linksChanged =
      update.links !== undefined &&
      Object.entries(update.links).some(
        ([key, url]) => previous.links?.[key] !== url,
      );
    const countdownChanged =
      update.countdown !== undefined &&
      !sameCountdown(update.countdown ?? undefined, previous.countdown);
    if (
      !detailChanged &&
      !progressChanged &&
      !linksChanged &&
      !countdownChanged
    )
      return;
    entry.snapshot = {
      ...previous,
      detail: detailChanged ? update.detail! : previous.detail,
      history:
        detailChanged && previous.detail
          ? [...previous.history, previous.detail]
          : previous.history,
      progress: progressChanged ? update.progress : previous.progress,
      links: linksChanged
        ? { ...previous.links, ...update.links }
        : previous.links,
      countdown: countdownChanged
        ? (update.countdown ?? undefined)
        : previous.countdown,
    };
    // A countdown ticks on the host: it is never a log line of its own.
    this.#publish(entry, detailChanged);
  }

  #end(
    entry: Entry,
    state: "done" | "failed" | "cancelled",
    detail: string,
  ): void {
    if (entry.snapshot.state !== "live") return;
    const detailChanged = entry.snapshot.detail !== detail;
    entry.snapshot = {
      ...entry.snapshot,
      state,
      detail,
      history:
        entry.snapshot.detail && detailChanged
          ? [...entry.snapshot.history, entry.snapshot.detail]
          : entry.snapshot.history,
      // An ended box waits for nothing.
      countdown: undefined,
    };
    entry.controller.abort(new ErrorException(detail));
    // The state change is always published; the line only when it says
    // something new (a watch returning keeps the current detail).
    this.#publish(entry, detailChanged);
  }

  #reparent(): void {
    for (const entry of this.#entries.values()) {
      if (!entry.options.follows) continue;
      const parent = this.#input.outcomes.parentBox(entry.options.follows);
      if (
        parent &&
        parent !== entry.snapshot.parent &&
        parent !== entry.snapshot.id
      ) {
        entry.snapshot = { ...entry.snapshot, parent };
        this.#publish(entry, false);
      }
    }
  }

  #publish(entry: Entry, withLine: boolean): void {
    this.#input.emit(entry.snapshot);
    if (withLine && entry.snapshot.detail)
      this.#input.log(
        `${entry.snapshot.title}: ${entry.snapshot.detail}`,
        entry.snapshot.id,
      );
    for (const check of [...this.#changed]) check();
  }
}
