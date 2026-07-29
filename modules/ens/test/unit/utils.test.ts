import { describe, expect, it } from "bun:test";
import { namehash } from "viem";
import {
  encodeContenthash,
  eth2LDLabel,
  getNode,
  isEth2LD,
} from "../../src/utils";

describe("Ens > utils", () => {
  describe("getNode", () => {
    it("returns the namehash of the normalized name", () => {
      expect(getNode("Vitalik.eth")).toBe(namehash("vitalik.eth"));
    });
  });

  describe("isEth2LD / eth2LDLabel", () => {
    it("detects .eth second-level names", () => {
      expect(isEth2LD("vitalik.eth")).toBe(true);
      expect(isEth2LD("sub.vitalik.eth")).toBe(false);
      expect(isEth2LD("vitalik.xyz")).toBe(false);
    });

    it("extracts the 2LD label", () => {
      expect(eth2LDLabel("vitalik.eth")).toBe("vitalik");
      expect(() => eth2LDLabel("sub.vitalik.eth")).toThrow(
        /not a second-level/,
      );
    });
  });

  describe("encodeContenthash", () => {
    const cid = "QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4";
    const encoded =
      "0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f";

    it("encodes ipfs:<hash>", () => {
      expect(encodeContenthash(`ipfs:${cid}`)).toBe(encoded);
    });

    it("encodes ipfs://<hash>", () => {
      expect(encodeContenthash(`ipfs://${cid}`)).toBe(encoded);
    });

    it("passes 0x bytes through", () => {
      expect(encodeContenthash(encoded)).toBe(encoded);
    });

    it("rejects unsupported codecs", () => {
      expect(() => encodeContenthash("http://example.com")).toThrow(
        /Only ipfs, ipns and skynet/,
      );
    });

    it("rejects missing hashes", () => {
      expect(() => encodeContenthash("ipfs")).toThrow(
        /Only ipfs, ipns and skynet/,
      );
    });
  });
});
