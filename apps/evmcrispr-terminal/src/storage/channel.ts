/** The part of `BroadcastChannel` the app uses. */
export interface ChannelLike {
  postMessage(data: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  close(): void;
}

export type OpenChannel = (name: string) => ChannelLike;

export const openBroadcastChannel: OpenChannel = (name) =>
  new BroadcastChannel(name);

/** Channels that only reach the tab itself: a browser without
 *  `BroadcastChannel` behaves as a single tab. */
export const openSilentChannel: OpenChannel = () => ({
  postMessage() {},
  addEventListener() {},
  close() {},
});
