import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";
import {
  AUTO_PTAU_MAX_POWER,
  DEV_PTAU_MAX_POWER,
  getPtau,
  hezPtauUrl,
  buildCircomSetupOptions,
  parsePtauValue,
  ptauPowerFor,
} from "../../src/utils/setup";

describe("circom utils > setup", () => {
  describe("buildCircomSetupOptions", () => {
    it("defaults to auto + groth16", () => {
      expect(buildCircomSetupOptions({})).to.deep.equal({
        ptau: { kind: "auto" },
        system: "groth16",
      });
    });

    it("parses ptau:dev and ptau:<url>", () => {
      expect(buildCircomSetupOptions({ ptau: "dev" }).ptau).to.deep.equal({
        kind: "dev",
      });
      expect(
        buildCircomSetupOptions({ ptau: "https://x.test/a.ptau" }).ptau,
      ).to.deep.equal({ kind: "url", url: "https://x.test/a.ptau" });
      expect(
        buildCircomSetupOptions({ ptau: "ipfs://Qm123/final.ptau" }).ptau,
      ).to.deep.equal({ kind: "url", url: "ipfs://Qm123/final.ptau" });
    });

    it("rejects invalid ptau values with the supported list", () => {
      expect(() => buildCircomSetupOptions({ ptau: "whatever" })).to.throw(
        'invalid ptau "whatever" — supported: ptau:dev, ptau:<url>',
      );
    });
  });

  describe("parsePtauValue", () => {
    it("maps dev/url/undefined", () => {
      expect(parsePtauValue("dev")).to.deep.equal({ kind: "dev" });
      expect(parsePtauValue("https://x.test/a.ptau")).to.deep.equal({
        kind: "url",
        url: "https://x.test/a.ptau",
      });
      expect(parsePtauValue(undefined)).to.equal(undefined);
      expect(parsePtauValue("nonsense")).to.equal(undefined);
    });
  });

  describe("ptauPowerFor", () => {
    it("selects the smallest power with headroom", () => {
      expect(ptauPowerFor(1, 2)).to.equal(2);
      expect(ptauPowerFor(1, 8)).to.equal(8);
      expect(ptauPowerFor(300, 8)).to.equal(10);
      expect(ptauPowerFor(2048, 8)).to.equal(12);
      expect(ptauPowerFor(4096, 8)).to.equal(13);
    });
  });

  describe("getPtau caps", () => {
    it("rejects circuits beyond the dev cap", async () => {
      const constraints = 2 ** DEV_PTAU_MAX_POWER;
      let message = "";
      await getPtau({ kind: "dev" }, constraints, "groth16", {}).catch(
        (err) => {
          message = err.message;
        },
      );
      expect(message).to.include("too large for ptau:dev");
    });

    it("rejects circuits beyond the auto cap", async () => {
      const constraints = 2 ** AUTO_PTAU_MAX_POWER;
      let message = "";
      await getPtau({ kind: "auto" }, constraints, "groth16", {}).catch(
        (err) => {
          message = err.message;
        },
      );
      expect(message).to.include("too large for an in-place setup");
      expect(message).to.include("--wasm/--zkey");
    });
  });

  it("formats hez ptau URLs with zero-padded powers", () => {
    expect(hezPtauUrl(8)).to.equal(
      "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_08.ptau",
    );
    expect(hezPtauUrl(12)).to.equal(
      "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_12.ptau",
    );
  });
});
