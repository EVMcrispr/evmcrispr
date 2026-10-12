import type { ChannelLike, OpenChannel } from "../../src/storage/channel";

type Listener = (event: { data: unknown }) => void;

/** Channels of one fake browser: a message reaches every other channel of
 *  the same name, cloned and asynchronously, as `BroadcastChannel` does. */
export function channelHub(): OpenChannel {
  const rooms = new Map<string, Set<Listener>>();
  return (name) => {
    const mine = new Set<Listener>();
    const room = rooms.get(name) ?? new Set();
    rooms.set(name, room);
    let closed = false;
    const channel: ChannelLike = {
      postMessage(data) {
        const copy = structuredClone(data);
        for (const listener of room)
          if (!mine.has(listener))
            queueMicrotask(() => listener({ data: copy }));
      },
      addEventListener(_type, listener) {
        if (closed) return;
        mine.add(listener);
        room.add(listener);
      },
      close() {
        closed = true;
        for (const listener of mine) room.delete(listener);
        mine.clear();
      },
    };
    return channel;
  };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
