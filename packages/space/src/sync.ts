import type { TimelinePatch } from "./timeline";

/** What two copies of a space exchange. Private records never travel. */
export type SpaceMessage =
  | { kind: "doc"; update: Uint8Array }
  | { kind: "timeline"; patch: TimelinePatch };

export interface SpaceLink {
  send(message: SpaceMessage): void;
  leave(): void;
}

/** A way to reach other copies of a space. Piece 1 has one: the tabs of
 *  this browser. The relay (piece 3) is another implementation. */
export interface SpaceTransport {
  join(spaceId: string, onMessage: (message: SpaceMessage) => void): SpaceLink;
}
