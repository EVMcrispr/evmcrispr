import { afterEach, describe, expect, it } from "bun:test";
import { buildTarball, sha512Base64 } from "@evmcrispr/test-utils/msw/npm";
import {
  fetchNpmLatestVersion,
  fetchVerifiedNpmFile,
  parseNpmFileSpec,
  parseNpmPackageName,
} from "../../src/utils/npmRegistry";

describe("parseNpmFileSpec", () => {
  it("parses scoped and unscoped pinned paths", () => {
    expect(
      parseNpmFileSpec("@openzeppelin/contracts@5.4.0/token/ERC20/ERC20.sol"),
    ).toEqual({
      name: "@openzeppelin/contracts",
      version: "5.4.0",
      path: "token/ERC20/ERC20.sol",
    });
    expect(
      parseNpmFileSpec("circomlib@2.0.5/circuits/poseidon.circom"),
    ).toEqual({
      name: "circomlib",
      version: "2.0.5",
      path: "circuits/poseidon.circom",
    });
    expect(parseNpmFileSpec("pkg@1.2.3-rc.1/src/a.sol")?.version).toBe(
      "1.2.3-rc.1",
    );
  });

  it("rejects unpinned, tagged and ranged specs", () => {
    expect(parseNpmFileSpec("@openzeppelin/contracts/token/ERC20.sol")).toBe(
      null,
    );
    expect(parseNpmFileSpec("circomlib/circuits/poseidon.circom")).toBe(null);
    expect(parseNpmFileSpec("pkg@latest/src/a.sol")).toBe(null);
    expect(parseNpmFileSpec("pkg@^1.2.3/src/a.sol")).toBe(null);
    expect(parseNpmFileSpec("pkg@1.2/src/a.sol")).toBe(null);
  });

  it("extracts bare package names for suggestions", () => {
    expect(parseNpmPackageName("@openzeppelin/contracts/token/E.sol")).toBe(
      "@openzeppelin/contracts",
    );
    expect(parseNpmPackageName("circomlib/circuits/a.circom")).toBe(
      "circomlib",
    );
  });
});

describe("fetchVerifiedNpmFile", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** Stub the registry: version metadata + tarball, with real integrity. */
  const serveRegistry = async (
    files: Record<string, string>,
    opts: { tamper?: boolean; integrity?: string } = {},
  ) => {
    const tgz = buildTarball(files);
    const integrity = opts.integrity ?? `sha512-${await sha512Base64(tgz)}`;
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith(".tgz")) {
        let body = tgz;
        if (opts.tamper) {
          body = new Uint8Array(tgz);
          body[body.length - 1] ^= 0xff;
        }
        return new Response(body as unknown as BodyInit, { status: 200 });
      }
      return Response.json({
        dist: { integrity, tarball: "https://registry.npmjs.org/x/-/x.tgz" },
      });
    }) as any;
  };

  it("returns a file from a verified tarball", async () => {
    await serveRegistry({
      "contracts/Token.sol": "contract Token {}",
      "contracts/sub/Util.sol": "library Util {}",
    });
    const bytes = await fetchVerifiedNpmFile({
      name: "@fake/pkg",
      version: "1.0.0",
      path: "contracts/Token.sol",
    });
    expect(new TextDecoder().decode(bytes)).toBe("contract Token {}");
  });

  it("rejects a tarball that does not match the registry integrity", async () => {
    await serveRegistry({ "a.sol": "x" }, { tamper: true });
    await expect(
      fetchVerifiedNpmFile({ name: "evil", version: "9.9.9", path: "a.sol" }),
    ).rejects.toThrow(/does not match its registry integrity/);
  });

  it("rejects packages without sha512 integrity", async () => {
    await serveRegistry({ "a.sol": "x" }, { integrity: "sha1-abcdef" });
    await expect(
      fetchVerifiedNpmFile({ name: "old", version: "0.0.1", path: "a.sol" }),
    ).rejects.toThrow(/no sha512 integrity/);
  });

  it("errors on files missing from the package", async () => {
    await serveRegistry({ "a.sol": "x" });
    await expect(
      fetchVerifiedNpmFile({ name: "p", version: "1.0.0", path: "b.sol" }),
    ).rejects.toThrow(/contains no file "b.sol"/);
  });
});

describe("fetchNpmLatestVersion", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("reads the latest dist-tag", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      expect(String(url)).toBe(
        "https://registry.npmjs.org/@scope%2fpkg/latest",
      );
      return Response.json({ version: "3.2.1" });
    }) as any;
    expect(await fetchNpmLatestVersion("@scope/pkg")).toBe("3.2.1");
  });
});
