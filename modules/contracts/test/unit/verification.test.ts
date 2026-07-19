import { describe, expect, it } from "bun:test";
import { bytesToHex } from "viem";
import type { SolcStandardOutput } from "../../src/utils/verification";
import {
  matchesDeployedBytecode,
  selectVerifyTarget,
  stripCborMetadata,
  withDeployedBytecodeSelection,
} from "../../src/utils/verification";

/** Append a synthetic CBOR metadata blob (map header + filler + length). */
function withCbor(code: number[], filler: number): `0x${string}` {
  const payload = [0xa2, filler, filler, filler];
  const bytes = [...code, ...payload, 0x00, payload.length];
  return bytesToHex(new Uint8Array(bytes));
}

const RUNTIME = [0x60, 0x80, 0x60, 0x40, 0x52, 0x00, 0x00, 0x00, 0x00, 0xf3];

describe("Contracts > utils > verification", () => {
  describe("stripCborMetadata", () => {
    it("strips a plausible CBOR suffix", () => {
      const input = new Uint8Array([1, 2, 3, 0xa2, 9, 9, 9, 0x00, 0x04]);
      expect([...stripCborMetadata(input)]).toEqual([1, 2, 3]);
    });

    it("leaves code without a CBOR suffix untouched", () => {
      const input = new Uint8Array([1, 2, 3, 4]);
      expect([...stripCborMetadata(input)]).toEqual([1, 2, 3, 4]);
    });

    it("leaves code with an implausible length untouched", () => {
      const input = new Uint8Array([1, 2, 0xff, 0xff]);
      expect([...stripCborMetadata(input)]).toEqual([1, 2, 0xff, 0xff]);
    });
  });

  describe("matchesDeployedBytecode", () => {
    it("matches identical code with different metadata suffixes", () => {
      const onchain = withCbor(RUNTIME, 0x11);
      const compiled = withCbor(RUNTIME, 0x22);
      expect(matchesDeployedBytecode(onchain, compiled).match).toBe(true);
    });

    it("reports a mismatch with the differing offset", () => {
      const other = [...RUNTIME];
      other[2] = 0x61;
      const res = matchesDeployedBytecode(
        withCbor(RUNTIME, 0x11),
        withCbor(other, 0x11),
      );
      expect(res.match).toBe(false);
      expect(res.reason).toContain("offset 0x2");
    });

    it("reports a length mismatch after metadata strip", () => {
      const res = matchesDeployedBytecode(
        withCbor(RUNTIME, 0x11),
        withCbor([...RUNTIME, 0x00], 0x11),
      );
      expect(res.match).toBe(false);
      expect(res.reason).toContain("length mismatch");
    });

    it("masks immutable ranges on both sides", () => {
      // On-chain has the constructor-set value at bytes 5..8; the compiled
      // artifact has zeros there.
      const onchainCode = [...RUNTIME];
      onchainCode[5] = 0xde;
      onchainCode[6] = 0xad;
      onchainCode[7] = 0xbe;
      onchainCode[8] = 0xef;
      const res = matchesDeployedBytecode(
        withCbor(onchainCode, 0x11),
        withCbor(RUNTIME, 0x22),
        { immutableReferences: { "7": [{ start: 5, length: 4 }] } },
      );
      expect(res.match).toBe(true);
    });

    it("still detects differences outside masked ranges", () => {
      const onchainCode = [...RUNTIME];
      onchainCode[5] = 0xde;
      onchainCode[1] = 0x99; // outside the immutable range
      const res = matchesDeployedBytecode(
        withCbor(onchainCode, 0x11),
        withCbor(RUNTIME, 0x22),
        { immutableReferences: { "7": [{ start: 5, length: 1 }] } },
      );
      expect(res.match).toBe(false);
    });
  });

  describe("selectVerifyTarget", () => {
    const output: SolcStandardOutput = {
      contracts: {
        "input.sol": {
          Token: { evm: { deployedBytecode: { object: "6080" } } },
          IToken: { evm: { deployedBytecode: { object: "" } } },
        },
        "https://host/x/Lib.sol": {
          Lib: { evm: { deployedBytecode: { object: "6081" } } },
        },
      },
    };

    it("resolves a qualified name (splitting at the last colon)", () => {
      expect(
        selectVerifyTarget(output, "https://host/x/Lib.sol:Lib")
          .deployedBytecode,
      ).toBe("0x6081");
      expect(
        selectVerifyTarget(output, "input.sol:Token").deployedBytecode,
      ).toBe("0x6080");
    });

    it("resolves a unique plain name across files", () => {
      expect(selectVerifyTarget(output, "Lib").deployedBytecode).toBe("0x6081");
    });

    it("throws for unknown or bytecode-less contracts", () => {
      expect(() => selectVerifyTarget(output, "input.sol:Nope")).toThrow(
        /not found/,
      );
      expect(() => selectVerifyTarget(output, "input.sol:IToken")).toThrow(
        /not found/,
      );
    });

    it("throws listing files when a plain name is ambiguous", () => {
      const dup: SolcStandardOutput = {
        contracts: {
          "a.sol": { X: { evm: { deployedBytecode: { object: "60" } } } },
          "b.sol": { X: { evm: { deployedBytecode: { object: "61" } } } },
        },
      };
      expect(() => selectVerifyTarget(dup, "X")).toThrow(/several files/);
    });
  });

  describe("withDeployedBytecodeSelection", () => {
    it("replaces outputSelection and keeps other settings", () => {
      const json = JSON.stringify({
        language: "Solidity",
        sources: { "a.sol": { content: "contract A {}" } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["evm.bytecode.object"] } },
        },
      });
      const out = JSON.parse(withDeployedBytecodeSelection(json));
      expect(out.settings.outputSelection["*"]["*"]).toEqual([
        "abi",
        "evm.deployedBytecode",
      ]);
      expect(out.settings.optimizer).toEqual({ enabled: true, runs: 200 });
      expect(out.sources["a.sol"].content).toBe("contract A {}");
    });

    it("throws on non-JSON source", () => {
      expect(() => withDeployedBytecodeSelection("contract A {}")).toThrow(
        /Standard JSON/,
      );
    });
  });
});
