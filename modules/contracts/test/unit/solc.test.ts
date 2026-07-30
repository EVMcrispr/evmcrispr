import { describe, expect, it } from "bun:test";
import {
  buildCompileOptions,
  buildStandardJson,
  compileCacheKey,
  DEFAULT_OPTIONS,
  parsePragma,
  selectContract,
  selectVersion,
} from "../../src/utils/solc";

describe("Contracts > utils > solc", () => {
  describe("buildCompileOptions", () => {
    it("defaults to optimizer on with 200 runs", () => {
      const o = buildCompileOptions({});
      expect(o.optimizerEnabled).toBe(true);
      expect(o.optimizerRuns).toBe(200);
      expect(o.viaIR).toBe(false);
      expect(o.version).toBeUndefined();
      expect(o.evmVersion).toBeUndefined();
    });

    it("builds every supported option", () => {
      const o = buildCompileOptions({
        version: "0.8.20",
        runs: 1000,
        "via-ir": true,
        evm: "cancun",
        contract: "MyToken",
      });
      expect(o.version).toBe("0.8.20");
      expect(o.optimizerRuns).toBe(1000);
      expect(o.optimizerEnabled).toBe(true);
      expect(o.viaIR).toBe(true);
      expect(o.evmVersion).toBe("cancun");
      expect(o.contract).toBe("MyToken");
    });

    it("optimizer:false disables the optimizer", () => {
      const o = buildCompileOptions({ optimizer: false });
      expect(o.optimizerEnabled).toBe(false);
    });

    it("throws on malformed values", () => {
      expect(() => buildCompileOptions({ version: "0.8" })).toThrow(
        /invalid version/,
      );
      expect(() => buildCompileOptions({ runs: "many" })).toThrow(
        /invalid runs/,
      );
    });
  });

  describe("parsePragma", () => {
    it("extracts the constraint expression", () => {
      expect(parsePragma("pragma solidity ^0.8.20;\ncontract A {}")).toBe(
        "^0.8.20",
      );
      expect(parsePragma("pragma solidity >=0.7.0 <0.9.0;")).toBe(
        ">=0.7.0 <0.9.0",
      );
      expect(parsePragma("contract A {}")).toBeUndefined();
    });
  });

  describe("selectVersion", () => {
    const releases = ["0.5.17", "0.6.12", "0.7.6", "0.8.19", "0.8.26"];

    it("resolves an exact pin", () => {
      expect(selectVersion("0.8.19", releases)).toBe("0.8.19");
    });

    it("resolves a caret constraint to the newest matching release", () => {
      expect(selectVersion("^0.8.0", releases)).toBe("0.8.26");
      expect(selectVersion("^0.7.0", releases)).toBe("0.7.6");
    });

    it("resolves a range constraint", () => {
      expect(selectVersion(">=0.7.0 <0.8.20", releases)).toBe("0.8.19");
    });

    it("never selects releases below the 0.6.0 floor", () => {
      expect(() => selectVersion("^0.5.0", releases)).toThrow(
        /no solc release/,
      );
    });

    it("throws when nothing satisfies", () => {
      expect(() => selectVersion("^0.9.0", releases)).toThrow(
        /no solc release/,
      );
    });

    it("throws on unsupported constraint syntax", () => {
      expect(() => selectVersion("~0.8.0", releases)).toThrow(/unsupported/);
    });
  });

  describe("buildStandardJson", () => {
    it("emits language, sources and settings", () => {
      const json = JSON.parse(
        buildStandardJson({ "input.sol": "contract A {}" }, DEFAULT_OPTIONS),
      );
      expect(json.language).toBe("Solidity");
      expect(json.sources["input.sol"].content).toBe("contract A {}");
      expect(json.settings.optimizer).toEqual({ enabled: true, runs: 200 });
      expect(json.settings.outputSelection["*"]["*"]).toContain(
        "evm.bytecode.object",
      );
      expect(json.settings.viaIR).toBeUndefined();
      expect(json.settings.evmVersion).toBeUndefined();
    });

    it("includes viaIR and evmVersion when set", () => {
      const json = JSON.parse(
        buildStandardJson(
          { "input.sol": "" },
          { ...DEFAULT_OPTIONS, viaIR: true, evmVersion: "cancun" },
        ),
      );
      expect(json.settings.viaIR).toBe(true);
      expect(json.settings.evmVersion).toBe("cancun");
    });
  });

  describe("selectContract", () => {
    const out = (bytecode: string) => ({
      abi: [{ type: "function" }],
      evm: { bytecode: { object: bytecode } },
    });

    it("picks the single deployable contract in the root unit", () => {
      const sel = selectContract(
        {
          "input.sol": { Token: out("6080"), IToken: out("") },
          "lib.sol": { Lib: out("6081") },
        },
        "input.sol",
        undefined,
      );
      expect(sel.qualifiedName).toBe("input.sol:Token");
      expect(sel.bytecode).toBe("0x6080");
      expect(sel.abi).toHaveLength(1);
    });

    it("falls back to the root file-stem match", () => {
      const sel = selectContract(
        {
          "https://host/x/Token.sol": {
            Token: out("6080"),
            Helper: out("6081"),
          },
        },
        "https://host/x/Token.sol",
        undefined,
      );
      expect(sel.qualifiedName).toBe("https://host/x/Token.sol:Token");
    });

    it("honors the contract: hint", () => {
      const sel = selectContract(
        { "input.sol": { A: out("60"), B: out("61") } },
        "input.sol",
        "B",
      );
      expect(sel.qualifiedName).toBe("input.sol:B");
    });

    it("throws when the hint does not exist", () => {
      expect(() =>
        selectContract({ "input.sol": { A: out("60") } }, "input.sol", "Z"),
      ).toThrow(/contract "Z" not found/);
    });

    it("throws when the hint is abstract", () => {
      expect(() =>
        selectContract({ "input.sol": { A: out("") } }, "input.sol", "A"),
      ).toThrow(/no deployable bytecode/);
    });

    it("throws listing candidates when ambiguous", () => {
      expect(() =>
        selectContract(
          { "input.sol": { A: out("60"), B: out("61") } },
          "input.sol",
          undefined,
        ),
      ).toThrow(/several deployable contracts.*A, B/);
    });

    it("throws when nothing is deployable", () => {
      expect(() =>
        selectContract({ "input.sol": { I: out("") } }, "input.sol", undefined),
      ).toThrow(/no deployable contract/);
    });
  });

  describe("compileCacheKey", () => {
    it("is stable for identical inputs and differs across options", () => {
      const a = compileCacheKey("contract A {}", buildCompileOptions({}));
      const b = compileCacheKey("contract A {}", buildCompileOptions({}));
      const c = compileCacheKey(
        "contract A {}",
        buildCompileOptions({ "via-ir": true }),
      );
      const d = compileCacheKey("contract B {}", buildCompileOptions({}));
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(a).not.toBe(d);
    });
  });
});
