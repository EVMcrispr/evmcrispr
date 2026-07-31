import "../setup";
import { describe, expect, it } from "bun:test";
import type { Module } from "@evmcrispr/sdk";
import { ADAPTERS, resolveAdapter } from "../../src/adapters/registry";
import {
  DAI_MAINNET,
  LINK_MAINNET,
  USDC_MAINNET,
  ZERO_ADDRESS,
} from "../fixtures";

/** resolveAdapter only reaches the module for nothing — a stub suffices. */
const stubModule = {} as Module;

describe("bridges > adapter registry (unit)", () => {
  describe("implicit selection", () => {
    it("picks CCTPv2 for native USDC on a CCTP lane", async () => {
      const adapter = await resolveAdapter(stubModule, undefined, {
        srcChainId: 1,
        dstChainId: 8453,
        token: USDC_MAINNET,
      });
      expect(adapter.name).toBe("CCTPv2");
    });

    it("picks Across for a non-USDC ERC-20", async () => {
      const adapter = await resolveAdapter(stubModule, undefined, {
        srcChainId: 1,
        dstChainId: 8453,
        token: DAI_MAINNET,
      });
      expect(adapter.name).toBe("Across");
    });

    it("picks NativeBridge for the native token on an L1 to L2 lane", async () => {
      const adapter = await resolveAdapter(stubModule, undefined, {
        srcChainId: 1,
        dstChainId: 10,
        token: ZERO_ADDRESS,
      });
      expect(adapter.name).toBe("NativeBridge");
    });

    it("never picks LayerZero or CCIP implicitly", async () => {
      // Gnosis has no CCTP, no Across SpokePool and no canonical L2 lane.
      await expect(
        resolveAdapter(stubModule, undefined, {
          srcChainId: 100,
          dstChainId: 1,
          token: DAI_MAINNET,
        }),
      ).rejects.toThrow("try --using LayerZero or --using CCIP");
    });
  });

  describe("explicit --using", () => {
    it("rejects an unknown adapter, listing the known ones", async () => {
      await expect(
        resolveAdapter(stubModule, "Hop", {
          srcChainId: 1,
          dstChainId: 10,
          token: DAI_MAINNET,
        }),
      ).rejects.toThrow(/unknown bridge adapter "Hop".*CCTPv2, Across/s);
    });

    it("is case-insensitive", async () => {
      const adapter = await resolveAdapter(stubModule, "cctpv2", {
        srcChainId: 1,
        dstChainId: 10,
        token: USDC_MAINNET,
      });
      expect(adapter.name).toBe("CCTPv2");
    });

    it("rejects an adapter that does not serve the lane", async () => {
      await expect(
        resolveAdapter(stubModule, "CCTPv2", {
          srcChainId: 1,
          dstChainId: 100, // Gnosis has no native USDC
          token: USDC_MAINNET,
        }),
      ).rejects.toThrow(/CCTPv2 doesn't bridge .* from Ethereum to Gnosis/);
    });

    it("rejects CCTPv2 for a token that is not native USDC", async () => {
      await expect(
        resolveAdapter(stubModule, "CCTPv2", {
          srcChainId: 1,
          dstChainId: 8453,
          token: DAI_MAINNET,
        }),
      ).rejects.toThrow(/CCTPv2 doesn't bridge/);
    });

    it("allows CCIP and LayerZero when requested explicitly", async () => {
      const ccip = await resolveAdapter(stubModule, "CCIP", {
        srcChainId: 1,
        dstChainId: 42161,
        token: LINK_MAINNET,
      });
      expect(ccip.name).toBe("CCIP");

      const lz = await resolveAdapter(stubModule, "LayerZero", {
        srcChainId: 1,
        dstChainId: 42161,
        token: LINK_MAINNET,
      });
      expect(lz.name).toBe("LayerZero");
    });
  });

  describe("adapter metadata", () => {
    it("registers the five v1 adapters", () => {
      expect(
        Object.values(ADAPTERS)
          .map((a) => a.name)
          .sort(),
      ).toEqual(["Across", "CCIP", "CCTPv2", "LayerZero", "NativeBridge"]);
    });

    it("flags the two-step bridges as needing a claim", () => {
      expect(ADAPTERS.cctpv2.requiresClaim(1, 8453)).toBe(true);
      // Canonical withdrawals need prove + finalize; deposits do not.
      expect(ADAPTERS.nativebridge.requiresClaim(10, 1)).toBe(true);
      expect(ADAPTERS.nativebridge.requiresClaim(1, 10)).toBe(false);
      expect(ADAPTERS.across.requiresClaim(1, 10)).toBe(false);
      expect(ADAPTERS.layerzero.requiresClaim(1, 10)).toBe(false);
      expect(ADAPTERS.ccip.requiresClaim(1, 10)).toBe(false);
    });

    it("exposes a sim relay handler for every adapter", () => {
      for (const adapter of Object.values(ADAPTERS)) {
        expect(adapter.relayHandler?.id).toBeString();
      }
    });
  });
});
