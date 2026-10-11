export type Release = () => void;

/** What must happen once is held by one tab (Web Locks). The browser
 *  releases a lock when its tab closes or crashes. */
export interface Locks {
  /** Takes `name` if nobody holds it; null when another tab does. */
  tryHold(name: string): Promise<Release | null>;
  /** Waits for `name`, then holds it. */
  hold(name: string): Promise<Release>;
  /** Holds `name` together with other tabs: marks that this tab is there. */
  share(name: string): Promise<Release>;
  /** Whether anyone, this tab included, holds `name` in any mode. */
  isHeld(name: string): Promise<boolean>;
}

export const lockNames = {
  run: (spaceId: string) => `evmcrispr:run:${spaceId}`,
  open: (spaceId: string) => `evmcrispr:open:${spaceId}`,
  chat: (chatId: string) => `evmcrispr:chat:${chatId}`,
  migrate: "evmcrispr:migrate",
};

export function webLocks(manager: LockManager): Locks {
  const take = (name: string, options: LockOptions) =>
    new Promise<Release | null>((resolve, reject) => {
      manager
        .request(name, options, (lock) => {
          if (!lock) {
            resolve(null);
            return;
          }
          return new Promise<void>((release) => resolve(release));
        })
        .catch(reject);
    });
  return {
    tryHold: (name) => take(name, { ifAvailable: true }),
    hold: (name) => take(name, {}) as Promise<Release>,
    share: (name) => take(name, { mode: "shared" }) as Promise<Release>,
    isHeld: async (name) =>
      ((await manager.query()).held ?? []).some((lock) => lock.name === name),
  };
}

/** Locks kept in memory. One `LockTable` per browser: a tab without the
 *  Web Locks API has its own (it then holds every lock it asks for);
 *  tests share one between the instances that play the tabs. */
export class LockTable {
  held = new Map<string, { exclusive: boolean; count: number }>();
  waiting = new Map<string, (() => void)[]>();
}

export function localLocks(table = new LockTable()): Locks {
  const releaser = (name: string): Release => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const entry = table.held.get(name);
      if (!entry) return;
      if (--entry.count > 0) return;
      table.held.delete(name);
      table.waiting.get(name)?.shift()?.();
    };
  };
  const grab = (name: string, exclusive: boolean): Release | null => {
    const entry = table.held.get(name);
    if (entry && (exclusive || entry.exclusive)) return null;
    if (entry) entry.count++;
    else table.held.set(name, { exclusive, count: 1 });
    return releaser(name);
  };
  const wait = (name: string, exclusive: boolean): Promise<Release> => {
    const got = grab(name, exclusive);
    if (got) return Promise.resolve(got);
    return new Promise((resolve) => {
      const queue = table.waiting.get(name) ?? [];
      table.waiting.set(name, queue);
      queue.push(() => void wait(name, exclusive).then(resolve));
    });
  };
  return {
    tryHold: async (name) => grab(name, true),
    hold: (name) => wait(name, true),
    share: (name) => wait(name, false),
    isHeld: async (name) => table.held.has(name),
  };
}
