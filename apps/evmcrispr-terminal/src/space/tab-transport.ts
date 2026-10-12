import type { SpaceMessage, SpaceTransport } from "@evmcrispr/space";
import type { OpenChannel } from "../storage/channel";

/** Reaches the other tabs of this browser showing the same space. */
export function tabTransport(open: OpenChannel): SpaceTransport {
  return {
    join(spaceId, onMessage) {
      const channel = open(`evmcrispr-space-${spaceId}`);
      channel.addEventListener("message", (event) =>
        onMessage(event.data as SpaceMessage),
      );
      return {
        send: (message) => channel.postMessage(message),
        leave: () => channel.close(),
      };
    },
  };
}
