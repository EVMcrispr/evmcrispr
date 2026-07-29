import { describe, expect, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import {
  PERM_CREATE,
  PERM_DELETE,
  PERM_FULL,
  PERM_UPDATE,
  parsePermissions,
} from "../../src/utils/acl";
import {
  INT96_MAX,
  parseDuration,
  parseFlowRate,
  parseFlowRateOrZero,
} from "../../src/utils/rate";

const MONTH = 2592000n; // 30d — the Superfluid convention and EVML `mo`

describe("parseFlowRate", () => {
  it("floors an exact rational rate literal to wei/second", () => {
    // 1000e18/mo arrives as Num(10^21, 2592000)
    const rate = parseFlowRate(Num(10n ** 21n, MONTH));
    expect(rate).toBe(10n ** 21n / MONTH);
    expect(rate).toBe(385802469135802n);
  });

  it("accepts a plain integer wei/second rate", () => {
    expect(parseFlowRate(Num.fromBigInt(1000n))).toBe(1000n);
  });

  it("rejects rates that floor to zero", () => {
    // 1/y = 1/31536000 wei per second
    expect(() => parseFlowRate(Num(1n, 31536000n))).toThrow(
      "greater than zero",
    );
  });

  it("rejects rates above int96", () => {
    expect(() => parseFlowRate(Num.fromBigInt(INT96_MAX + 1n))).toThrow(
      "int96",
    );
  });

  it("rejects non-numeric values", () => {
    expect(() => parseFlowRate("not-a-number")).toThrow("flow rate");
  });
});

describe("parseFlowRateOrZero", () => {
  it("allows zero (stop a distribution flow)", () => {
    expect(parseFlowRateOrZero(Num.fromBigInt(0n))).toBe(0n);
  });

  it("rejects negative rates", () => {
    expect(() => parseFlowRateOrZero(Num.fromBigInt(-1n))).toThrow("negative");
  });
});

describe("parseDuration", () => {
  it("accepts duration literals (seconds)", () => {
    expect(parseDuration(Num.fromBigInt(31536000n))).toBe(31536000n);
  });

  it("rejects durations beyond uint32", () => {
    expect(() => parseDuration(Num.fromBigInt(2n ** 32n))).toThrow("uint32");
  });
});

describe("parsePermissions", () => {
  it("defaults to full control", () => {
    expect(parsePermissions(undefined)).toBe(PERM_FULL);
    expect(parsePermissions("full")).toBe(PERM_FULL);
  });

  it("combines comma-separated permissions", () => {
    expect(parsePermissions("create")).toBe(PERM_CREATE);
    expect(parsePermissions("create,delete")).toBe(PERM_CREATE | PERM_DELETE);
    expect(parsePermissions("create,update,delete")).toBe(
      PERM_CREATE | PERM_UPDATE | PERM_DELETE,
    );
  });

  it("rejects unknown permission names", () => {
    expect(() => parsePermissions("admin")).toThrow("unknown permission");
  });
});
