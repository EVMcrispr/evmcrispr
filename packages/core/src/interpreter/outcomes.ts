import type { Action, ActionOutcome } from "@evmcrispr/sdk";

type Carrier =
  | { kind: "actions"; actions: Action[] }
  | { kind: "promise"; outcome: Promise<ActionOutcome>; box?: string };

interface Deferred {
  action: Action;
  promise: Promise<ActionOutcome>;
  resolve(outcome: ActionOutcome): void;
  settled: boolean;
}

/** Which action carries which, and how each ended. One per run. */
export class OutcomeRegistry {
  #carriers = new WeakMap<Action, Carrier>();
  #direct = new WeakMap<Action, Deferred>();
  #boxes = new WeakMap<Action, string>();
  #pending = new Set<Deferred>();
  #listeners: (() => void)[] = [];

  /** Called when links or boxes change, so boxes can re-parent. */
  onChange(listener: () => void): void {
    this.#listeners.push(listener);
  }

  link(inner: Action[], carriers: Action[]): void {
    const own = new Set(carriers);
    for (const action of inner) {
      if (own.has(action) || this.#carriers.has(action)) continue;
      if (carriers.length === 0) continue;
      this.#carriers.set(action, { kind: "actions", actions: carriers });
      this.#forward(action);
    }
    this.#changed();
  }

  carry(inner: Action[], outcome: Promise<ActionOutcome>, box?: string): void {
    for (const action of inner) {
      this.#carriers.set(action, { kind: "promise", outcome, box });
      this.#forward(action);
    }
    this.#changed();
  }

  attachBox(action: Action, box: string): void {
    this.#boxes.set(action, box);
    this.#changed();
  }

  settle(action: Action, outcome: ActionOutcome): void {
    this.#resolve(this.#deferred(action), outcome);
  }

  /** Ends every unsettled action as not-sent, except actions a carrier
   *  took over: they end with their carrier (which may settle later). */
  settleUnsent(reason: string): void {
    for (const deferred of [...this.#pending]) {
      if (this.#carried(deferred.action)) continue;
      this.#resolve(deferred, { kind: "not-sent", reason });
    }
  }

  async outcomeOf(actions: Action[]): Promise<ActionOutcome> {
    const outcomes = await Promise.all(
      actions.map((a) => this.#one(a, new Set())),
    );
    const failure = outcomes.find((o) => o.kind !== "confirmed");
    return failure ?? outcomes.at(-1) ?? { kind: "confirmed" };
  }

  /** The box a box following `actions` nests under: the box of a
   *  followed action that is itself sent (its transaction box), else the
   *  nearest carrier box. */
  parentBox(actions: Action[]): string | undefined {
    for (const action of actions) {
      const own = this.#boxes.get(action);
      if (own) return own;
    }
    return this.carrierBox(actions);
  }

  /** The nearest box that carries `actions`, if any exists yet. */
  carrierBox(actions: Action[], seen = new Set<Action>()): string | undefined {
    for (const action of actions) {
      if (seen.has(action)) continue;
      seen.add(action);
      const carrier = this.#carriers.get(action);
      if (!carrier) continue;
      if (carrier.kind === "promise") {
        if (carrier.box) return carrier.box;
        continue;
      }
      for (const outer of carrier.actions) {
        const box = this.#boxes.get(outer);
        if (box) return box;
      }
      const deeper = this.carrierBox(carrier.actions, seen);
      if (deeper) return deeper;
    }
    return undefined;
  }

  /** `path` guards cycles along one chain only: sibling branches that share
   *  an ancestor must each follow it to its real carrier. */
  #one(action: Action, path: Set<Action>): Promise<ActionOutcome> {
    const carrier = this.#carriers.get(action);
    if (!carrier || path.has(action)) return this.#deferred(action).promise;
    if (carrier.kind === "promise") return carrier.outcome;
    const next = new Set(path).add(action);
    return Promise.all(carrier.actions.map((a) => this.#one(a, next))).then(
      (outcomes) =>
        outcomes.find((o) => o.kind !== "confirmed") ??
        outcomes.at(-1) ?? { kind: "confirmed" },
    );
  }

  /** A box may already wait on `action`'s own outcome (it watched while
   *  the command ran, before the enclosing block linked or carried it):
   *  hand that wait over to the carrier. */
  #forward(action: Action): void {
    const deferred = this.#direct.get(action);
    if (!deferred || deferred.settled || !this.#carried(action)) return;
    this.#one(action, new Set()).then((o) => this.#resolve(deferred, o));
  }

  /** True when `action`'s carrier chain ends somewhere other than back at
   *  `action` itself (a cycle would never settle). */
  #carried(action: Action): boolean {
    const walk = (current: Action, seen: Set<Action>): boolean => {
      const carrier = this.#carriers.get(current);
      if (!carrier) return current !== action;
      if (carrier.kind === "promise") return true;
      if (seen.has(current)) return false;
      seen.add(current);
      return carrier.actions.some((a) => walk(a, seen));
    };
    return this.#carriers.has(action) && walk(action, new Set());
  }

  #resolve(deferred: Deferred, outcome: ActionOutcome): void {
    if (deferred.settled) return;
    deferred.settled = true;
    this.#pending.delete(deferred);
    deferred.resolve(outcome);
  }

  #deferred(action: Action): Deferred {
    let deferred = this.#direct.get(action);
    if (!deferred) {
      let resolve!: (o: ActionOutcome) => void;
      const promise = new Promise<ActionOutcome>((r) => {
        resolve = r;
      });
      deferred = { action, promise, resolve, settled: false };
      this.#direct.set(action, deferred);
      this.#pending.add(deferred);
    }
    return deferred;
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }
}
