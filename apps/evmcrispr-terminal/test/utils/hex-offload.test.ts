import { describe, expect, test } from "bun:test";
import {
  buildIpfsGetCall,
  HEX_OFFLOAD_THRESHOLD_BYTES,
  isOffloadableHex,
} from "../../src/utils/hex-offload";

const hexOfBytes = (bytes: number) => `0x${"ab".repeat(bytes)}`;

describe("isOffloadableHex", () => {
  test("accepts hex above the threshold", () => {
    expect(isOffloadableHex(hexOfBytes(HEX_OFFLOAD_THRESHOLD_BYTES + 1))).toBe(
      true,
    );
    expect(isOffloadableHex(hexOfBytes(1000))).toBe(true);
  });

  test("rejects hex at or below the threshold", () => {
    expect(isOffloadableHex(hexOfBytes(HEX_OFFLOAD_THRESHOLD_BYTES))).toBe(
      false,
    );
    expect(isOffloadableHex(hexOfBytes(1))).toBe(false);
    expect(isOffloadableHex("0x")).toBe(false);
  });

  test("ignores surrounding whitespace", () => {
    expect(isOffloadableHex(`  ${hexOfBytes(100)}\n`)).toBe(true);
  });

  test("rejects non-hex and embedded hex", () => {
    expect(isOffloadableHex("hello")).toBe(false);
    expect(isOffloadableHex(`contracts:deploy $c ${hexOfBytes(100)}`)).toBe(
      false,
    );
    expect(isOffloadableHex(`0x${"zz".repeat(100)}`)).toBe(false);
    expect(isOffloadableHex(`${"ab".repeat(100)}`)).toBe(false);
  });

  test("rejects odd-length hex", () => {
    expect(isOffloadableHex(`0x${"a".repeat(131)}`)).toBe(false);
  });
});

describe("buildIpfsGetCall", () => {
  test("wraps the CID in an @ipfs.get call", () => {
    expect(buildIpfsGetCall("QmXyz")).toBe('@ipfs.get("QmXyz")');
  });
});
