import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import { keccak256, stringToHex } from "viem";
import {
  normalizePermissionName,
  permissionId,
} from "../../src/utils/permissions";

describe("AragonOSx > utils > permissions", () => {
  it("normalizes names to the _PERMISSION convention", () => {
    expect(normalizePermissionName("execute")).to.equal("EXECUTE_PERMISSION");
    expect(normalizePermissionName("EXECUTE_PERMISSION")).to.equal(
      "EXECUTE_PERMISSION",
    );
    expect(normalizePermissionName("upgrade-dao")).to.equal(
      "UPGRADE_DAO_PERMISSION",
    );
  });

  it("hashes permission names", () => {
    expect(permissionId("EXECUTE")).to.equal(
      keccak256(stringToHex("EXECUTE_PERMISSION")),
    );
    expect(permissionId("ROOT")).to.equal(
      "0x815fe80e4b37c8582a3b773d1d7071f983eacfd56b5965db654f3087c25ada33",
    );
  });

  it("passes bytes32 values through", () => {
    const hash = keccak256(stringToHex("CUSTOM_PERMISSION"));
    expect(permissionId(hash)).to.equal(hash);
  });

  it("rejects malformed hex ids", () => {
    expect(() => permissionId("0x1234")).to.throw("bytes32");
  });
});
