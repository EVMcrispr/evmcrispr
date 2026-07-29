import { describe, it } from "bun:test";
import { Num } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { keccak256, toHex } from "viem";
import { MAX_UINT64, resolveManagerRoleId, resolveRole } from "../../src/utils";

describe("AccessControl > unit > resolveRole", () => {
  it("hashes plain string roles for AccessControl", () => {
    expect(resolveRole("MINTER_ROLE")).to.eql({
      system: "access-control",
      role: keccak256(toHex("MINTER_ROLE")),
    });
  });

  it("maps DEFAULT_ADMIN_ROLE to bytes32 zero", () => {
    expect(resolveRole("DEFAULT_ADMIN_ROLE")).to.eql({
      system: "access-control",
      role: `0x${"00".repeat(32)}`,
    });
  });

  it("passes bytes32 values through", () => {
    const role = keccak256(toHex("X"));
    expect(resolveRole(role)).to.eql({ system: "access-control", role });
  });

  it("treats numbers as AccessManager role ids", () => {
    expect(resolveRole(Num.fromBigInt(42n))).to.eql({
      system: "access-manager",
      roleId: 42n,
    });
    expect(resolveRole("7")).to.eql({
      system: "access-manager",
      roleId: 7n,
    });
  });

  it("maps ADMIN_ROLE and PUBLIC_ROLE aliases", () => {
    expect(resolveRole("ADMIN_ROLE")).to.eql({
      system: "access-manager",
      roleId: 0n,
    });
    expect(resolveRole("PUBLIC_ROLE")).to.eql({
      system: "access-manager",
      roleId: MAX_UINT64,
    });
  });

  it("rejects out-of-range and fractional role ids", () => {
    expect(() => resolveManagerRoleId(Num.fromBigInt(MAX_UINT64 + 1n))).to
      .throw;
    expect(() => resolveManagerRoleId("1.5")).to.throw;
  });
});
