import { describe, expect, it } from "bun:test";
import {
  type PackageJson,
  parseSpecifier,
  resolvePackageEntry,
} from "../../src/utils/npmResolve";

describe("gelato > npmResolve", () => {
  it("parses bare, scoped, pinned and subpath specifiers", () => {
    expect(parseSpecifier("ky")).toEqual({
      name: "ky",
      version: undefined,
      subpath: "",
    });
    expect(parseSpecifier("@gelatonetwork/web3-functions-sdk")).toEqual({
      name: "@gelatonetwork/web3-functions-sdk",
      version: undefined,
      subpath: "",
    });
    expect(parseSpecifier("viem@2.1.0/chains")).toEqual({
      name: "viem",
      version: "2.1.0",
      subpath: "chains",
    });
    expect(parseSpecifier("@scope/pkg@1.0.0")).toEqual({
      name: "@scope/pkg",
      version: "1.0.0",
      subpath: "",
    });
  });

  it("prefers exports conditions in browser order", () => {
    const pkg = {
      exports: {
        ".": {
          browser: "./dist/browser.js",
          import: "./dist/index.mjs",
          default: "./dist/index.js",
        },
        "./sub/*": { import: "./dist/sub/*.mjs" },
      },
      main: "./lib/main.js",
    };
    expect(resolvePackageEntry(pkg, "")).toBe("dist/browser.js");
    expect(resolvePackageEntry(pkg, "sub/x")).toBe("dist/sub/x.mjs");
    expect(resolvePackageEntry(pkg, "hidden")).toBeNull();
  });

  it("falls back to browser, module then main", () => {
    expect(
      resolvePackageEntry({ module: "./esm/index.js", main: "cjs.js" }, ""),
    ).toBe("esm/index.js");
    expect(resolvePackageEntry({ main: "./lib/x.js" }, "")).toBe("lib/x.js");
    expect(resolvePackageEntry({}, "")).toBe("index.js");
    expect(resolvePackageEntry({ browser: "./b.js", main: "./m.js" }, "")).toBe(
      "b.js",
    );
  });

  it("applies object-form browser substitutions", () => {
    const pkg: PackageJson = {
      main: "./lib/index.js",
      browser: { "./lib/node.js": "./lib/web.js", "./lib/fs.js": false },
    };
    expect(resolvePackageEntry(pkg, "lib/node.js")).toBe("lib/web.js");
    expect(resolvePackageEntry(pkg, "lib/fs.js")).toBeNull();
    expect(resolvePackageEntry(pkg, "lib/other.js")).toBe("lib/other.js");
  });
});
