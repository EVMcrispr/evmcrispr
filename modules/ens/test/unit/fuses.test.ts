import { describe, expect, it } from "bun:test";
import {
  CANNOT_UNWRAP,
  decodeFuses,
  encodeFuses,
  hasParentFuses,
  IS_DOT_ETH,
  ownerFusesOf,
  PARENT_CANNOT_CONTROL,
  parseFuse,
  validateFusePrereqs,
} from "../../src/fuses";

describe("Ens > fuses", () => {
  describe("parseFuse", () => {
    it("parses kebab-case names", () => {
      expect(parseFuse("cannot-unwrap")).toBe(1);
      expect(parseFuse("cannot-transfer")).toBe(4);
      expect(parseFuse("parent-cannot-control")).toBe(0x10000);
      expect(parseFuse("can-extend-expiry")).toBe(0x40000);
    });

    it("parses canonical SCREAMING_SNAKE names", () => {
      expect(parseFuse("CANNOT_UNWRAP")).toBe(1);
      expect(parseFuse("PARENT_CANNOT_CONTROL")).toBe(0x10000);
    });

    it("rejects unknown fuses", () => {
      expect(() => parseFuse("cannot-fly")).toThrow(/unknown fuse/);
    });

    it("rejects is-dot-eth", () => {
      expect(() => parseFuse("is-dot-eth")).toThrow(/cannot be burned/);
    });
  });

  describe("encodeFuses / decodeFuses", () => {
    it("ORs fuse bits together", () => {
      expect(encodeFuses(["cannot-unwrap", "cannot-transfer"])).toBe(5);
      expect(encodeFuses(["parent-cannot-control", "cannot-unwrap"])).toBe(
        0x10001,
      );
    });

    it("round-trips", () => {
      const names = ["cannot-unwrap", "cannot-set-resolver"];
      expect(decodeFuses(encodeFuses(names))).toEqual(names);
    });

    it("decodes is-dot-eth and unknown bits", () => {
      expect(decodeFuses(IS_DOT_ETH | 1)).toEqual([
        "cannot-unwrap",
        "is-dot-eth",
      ]);
      expect(decodeFuses(1 << 20)).toEqual(["0x100000"]);
    });

    it("decodes 0 to an empty list", () => {
      expect(decodeFuses(0)).toEqual([]);
    });
  });

  describe("classification", () => {
    it("splits owner- and parent-controlled bits", () => {
      expect(hasParentFuses(CANNOT_UNWRAP)).toBe(false);
      expect(hasParentFuses(PARENT_CANNOT_CONTROL)).toBe(true);
      expect(ownerFusesOf(PARENT_CANNOT_CONTROL | CANNOT_UNWRAP)).toBe(
        CANNOT_UNWRAP,
      );
    });
  });

  describe("validateFusePrereqs", () => {
    it("requires cannot-unwrap when burning other owner fuses", () => {
      expect(() =>
        validateFusePrereqs(encodeFuses(["cannot-transfer"]), 0),
      ).toThrow(/requires cannot-unwrap/);
    });

    it("passes when cannot-unwrap is included", () => {
      expect(() =>
        validateFusePrereqs(
          encodeFuses(["cannot-unwrap", "cannot-transfer"]),
          0,
        ),
      ).not.toThrow();
    });

    it("passes when cannot-unwrap is already burned on-chain", () => {
      expect(() =>
        validateFusePrereqs(encodeFuses(["cannot-transfer"]), CANNOT_UNWRAP),
      ).not.toThrow();
    });

    it("requires parent-cannot-control for owner fuses set by the parent", () => {
      expect(() =>
        validateFusePrereqs(
          encodeFuses(["cannot-unwrap", "cannot-transfer"]),
          0,
          { isChild: true },
        ),
      ).toThrow(/parent-cannot-control/);
    });

    it("passes for child fuses when parent-cannot-control is included or burned", () => {
      expect(() =>
        validateFusePrereqs(
          encodeFuses([
            "parent-cannot-control",
            "cannot-unwrap",
            "cannot-transfer",
          ]),
          0,
          { isChild: true },
        ),
      ).not.toThrow();
      expect(() =>
        validateFusePrereqs(
          encodeFuses(["cannot-unwrap", "cannot-transfer"]),
          PARENT_CANNOT_CONTROL,
          { isChild: true },
        ),
      ).not.toThrow();
    });

    it("allows parent-controlled fuses alone", () => {
      expect(() =>
        validateFusePrereqs(encodeFuses(["can-extend-expiry"]), 0, {
          isChild: true,
        }),
      ).not.toThrow();
    });
  });
});
