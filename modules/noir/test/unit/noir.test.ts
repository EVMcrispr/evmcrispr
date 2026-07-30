import { describe, it } from "bun:test";
import { readFileSync } from "node:fs";
import { expect } from "@evmcrispr/test-utils";
import {
  artifactCompileKey,
  BB_VERSION,
  compileNoirCached,
  NOIR_VERSION,
  parseArtifactJson,
} from "../../src/utils/noir";
import { ASSERT_SOURCE } from "../fixtures";
import { ASSERT_ARTIFACT_JSON } from "../fixtures/assert-circuit";

const installedVersion = (spec: string) =>
  JSON.parse(
    readFileSync(new URL(import.meta.resolve(`${spec}/package.json`)), "utf8"),
  ).version as string;

const declaredVersion = (name: string) => {
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  return pkg.dependencies[name] as string;
};

describe("noir utils > noir", () => {
  // The whole Noir/Barretenberg wasm stack ships inside these packages, so
  // the lockfile is the integrity root — the pins must stay exact and the
  // constants must match what is actually installed.
  it("pins NOIR_VERSION to the installed dependencies", () => {
    expect(installedVersion("@noir-lang/noir_wasm")).to.equal(NOIR_VERSION);
    expect(installedVersion("@noir-lang/noir_js")).to.equal(NOIR_VERSION);
  });

  it("pins BB_VERSION to the installed @aztec/bb.js", () => {
    expect(installedVersion("@aztec/bb.js")).to.equal(BB_VERSION);
  });

  it("declares the noir/bb dependencies as exact versions", () => {
    expect(declaredVersion("@noir-lang/noir_wasm")).to.equal(NOIR_VERSION);
    expect(declaredVersion("@noir-lang/noir_js")).to.equal(NOIR_VERSION);
    expect(declaredVersion("@aztec/bb.js")).to.equal(BB_VERSION);
  });

  it("caches compiles per source", () => {
    const first = compileNoirCached(ASSERT_SOURCE, {});
    expect(compileNoirCached(ASSERT_SOURCE, {})).to.equal(first);
    expect(compileNoirCached(`${ASSERT_SOURCE}\n`, {})).to.not.equal(first);
  });

  it("strips the debug payload from compiled artifacts", async () => {
    const { program, artifactJson } = await compileNoirCached(
      ASSERT_SOURCE,
      {},
    );
    expect(Object.keys(program)).to.not.include.members([
      "debug_symbols",
      "file_map",
    ]);
    expect(JSON.parse(artifactJson).bytecode).to.be.a("string");
  });

  it("rejects external Nargo dependencies", async () => {
    let message = "";
    await compileNoirCached("use dep::foo;\nfn main() {}", {}).catch((err) => {
      message = err.message;
    });
    expect(message).to.include("external Nargo dependencies");
  });

  it("surfaces compiler diagnostics", async () => {
    let message = "";
    await compileNoirCached("fn main( {", {}).catch((err) => {
      message = err.message;
    });
    expect(message).to.include("@noir:compile: compilation failed");
  });

  describe("parseArtifactJson", () => {
    it("accepts the fixture artifact", () => {
      const artifact = parseArtifactJson(ASSERT_ARTIFACT_JSON, "t");
      expect(artifact.bytecode).to.be.a("string");
      expect(artifact.abi).to.be.an("object");
    });

    it("rejects non-JSON", () => {
      expect(() => parseArtifactJson("nope", "t")).to.throw(
        "t is not valid JSON",
      );
    });

    it("rejects JSON without bytecode/abi", () => {
      expect(() => parseArtifactJson('{"a":1}', "t")).to.throw(
        "not a compiled Noir program artifact",
      );
    });
  });

  it("keys artifact runs by content", () => {
    expect(artifactCompileKey(ASSERT_ARTIFACT_JSON)).to.equal(
      artifactCompileKey(ASSERT_ARTIFACT_JSON),
    );
    expect(artifactCompileKey(ASSERT_ARTIFACT_JSON)).to.not.equal(
      artifactCompileKey(`${ASSERT_ARTIFACT_JSON} `),
    );
  });
});
