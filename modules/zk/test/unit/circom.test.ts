import { describe, it } from "bun:test";
import { readFileSync } from "node:fs";
import { expect } from "@evmcrispr/test-utils";
import {
  CIRCOM_WASM_SHA256,
  CIRCOM2_VERSION,
  compileCircomCached,
  crawlIncludes,
  INLINE_ROOT_NAME,
  parseR1csConstraints,
  resolveInclude,
  virtualizeSources,
} from "../../src/utils/circom";
import { MULTIPLIER2_R1CS_B64 } from "../fixtures/multiplier2";

describe("zk utils > circom", () => {
  it("pins CIRCOM2_VERSION to the installed dependency", () => {
    const pkg = JSON.parse(
      readFileSync(
        new URL(import.meta.resolve("circom2/package.json")),
        "utf8",
      ),
    );
    expect(pkg.version).to.equal(CIRCOM2_VERSION);
  });

  it("pins CIRCOM_WASM_SHA256 to the installed circom.wasm", async () => {
    const wasm = readFileSync(
      new URL(import.meta.resolve("circom2/circom.wasm")),
    );
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", wasm as unknown as ArrayBuffer),
    );
    const hex = `0x${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    expect(hex).to.equal(CIRCOM_WASM_SHA256);
  });

  describe("resolveInclude", () => {
    it("passes URLs through", () => {
      expect(
        resolveInclude("https://x.test/a.circom", INLINE_ROOT_NAME),
      ).to.equal("https://x.test/a.circom");
    });

    it("maps bare npm paths as-is (fetched as verified tarballs)", () => {
      expect(
        resolveInclude("circomlib/circuits/poseidon.circom", INLINE_ROOT_NAME),
      ).to.equal("circomlib/circuits/poseidon.circom");
    });

    it("resolves relative includes against a URL includer", () => {
      expect(
        resolveInclude("./lib/a.circom", "https://x.test/dir/main.circom"),
      ).to.equal("https://x.test/dir/lib/a.circom");
    });

    it("resolves relative includes against an npm-path includer", () => {
      expect(
        resolveInclude("../bitify.circom", "circomlib/circuits/sub/a.circom"),
      ).to.equal("circomlib/circuits/bitify.circom");
    });

    it("rejects relative includes in inline source", () => {
      expect(() => resolveInclude("./a.circom", INLINE_ROOT_NAME)).to.throw(
        "relative include",
      );
    });

    it("rejects package-root escapes", () => {
      expect(() =>
        resolveInclude("../../../etc/passwd", "circomlib/circuits/a.circom"),
      ).to.throw("escapes its package root");
    });
  });

  describe("virtualizeSources", () => {
    it("assigns deterministic virtual paths and rewrites includes", () => {
      const sources = {
        [INLINE_ROOT_NAME]: 'include "circomlib/circuits/a.circom";\nmain',
        "circomlib/circuits/a.circom": 'include "./b.circom";\na',
        "circomlib/circuits/b.circom": "b",
      };
      const virtual = virtualizeSources(sources, INLINE_ROOT_NAME);
      expect(Object.keys(virtual)).to.deep.equal([
        "/main.circom",
        "/dep_0.circom",
        "/dep_1.circom",
      ]);
      expect(virtual["/main.circom"]).to.include('include "/dep_0.circom"');
      expect(virtual["/dep_0.circom"]).to.include('include "/dep_1.circom"');
      expect(virtual["/dep_1.circom"]).to.equal("b");
    });
  });

  it("parses the constraint count from an r1cs header", () => {
    const r1cs = Uint8Array.from(Buffer.from(MULTIPLIER2_R1CS_B64, "base64"));
    expect(parseR1csConstraints(r1cs)).to.equal(1);
  });

  it("rejects malformed r1cs data", () => {
    expect(() => parseR1csConstraints(new Uint8Array([1, 2, 3]))).to.throw(
      "malformed r1cs",
    );
  });

  it("caches compiles per source", () => {
    const src =
      "pragma circom 2.0.0;\ntemplate T() { signal input a; signal output b; b <== a * a; }\ncomponent main = T();";
    const first = compileCircomCached(src, {});
    expect(compileCircomCached(src, {})).to.equal(first);
    expect(compileCircomCached(`${src}\n`, {})).to.not.equal(first);
  });

  it("crawls include closures from inline roots", async () => {
    const sources = await crawlIncludes(
      "no includes here",
      INLINE_ROOT_NAME,
      {},
    );
    expect(sources).to.deep.equal({ [INLINE_ROOT_NAME]: "no includes here" });
  });
});
