import "../setup";
import { describe, expect, it } from "bun:test";
import Sim from "../../src";
import {
  matchesSourceEvent,
  type ReceiptLog,
  type RelayHandler,
} from "../../src/lib/relay";

const TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036" as const;
const OTHER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
const EMITTER = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const;

function log(overrides: Partial<ReceiptLog> = {}): ReceiptLog {
  return {
    address: EMITTER,
    topics: [TOPIC],
    data: "0x",
    ...overrides,
  };
}

describe("relay (unit)", () => {
  describe("matchesSourceEvent", () => {
    it("matches on topic0", () => {
      expect(matchesSourceEvent(log(), { topic: TOPIC })).toBe(true);
      expect(matchesSourceEvent(log(), { topic: OTHER_TOPIC })).toBe(false);
    });

    it("is case-insensitive on topic and address", () => {
      expect(
        matchesSourceEvent(log({ address: EMITTER.toLowerCase() as any }), {
          topic: TOPIC.toUpperCase().replace("0X", "0x") as any,
          address: EMITTER,
        }),
      ).toBe(true);
    });

    it("filters by emitter address when given", () => {
      expect(
        matchesSourceEvent(log(), { topic: TOPIC, address: EMITTER }),
      ).toBe(true);
      expect(
        matchesSourceEvent(log(), {
          topic: TOPIC,
          address: "0x0000000000000000000000000000000000000001",
        }),
      ).toBe(false);
    });

    it("ignores logs with no topics", () => {
      expect(matchesSourceEvent(log({ topics: [] }), { topic: TOPIC })).toBe(
        false,
      );
    });
  });

  describe("Sim relay state", () => {
    function handler(id: string): RelayHandler {
      return {
        id,
        sourceEvents: () => [{ topic: TOPIC }],
        parse: async () => null,
        buildDelivery: async () => [],
      };
    }

    it("registers handlers and dedupes by id", () => {
      const sim = new Sim({} as any);
      sim.registerRelayHandler(handler("cctp-v2"));
      sim.registerRelayHandler(handler("across"));
      sim.registerRelayHandler(handler("cctp-v2"));
      expect(sim.relayHandlers.map((h) => h.id)).toEqual(["cctp-v2", "across"]);
    });

    it("starts with no active chain or pending deliveries", () => {
      const sim = new Sim({} as any);
      expect(sim.activeChainId).toBeNull();
      expect(sim.pendingDeliveries).toEqual([]);
      expect(sim.mode).toBeNull();
    });
  });
});
