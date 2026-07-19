import { describe, expect, it } from "bun:test";
import { BindingsManager } from "../../src/BindingsManager";
import { BindingsSpace } from "../../src/types";
import {
  checkConfigAccess,
  getConfigDef,
  parseConfigVarName,
  readConfigValue,
} from "../../src/utils/configVars";

function managerWithStd(): BindingsManager {
  return new BindingsManager([
    {
      type: BindingsSpace.MODULE,
      identifier: "std",
      value: {
        commands: {},
        helpers: {},
        configs: [
          {
            name: "tokenlist",
            type: "string",
            description: "Custom tokenlist URL",
            default: "https://api.evmcrispr.com/tokenlist/{chainId}",
          },
          {
            name: "ipfsJwt",
            type: "string",
            description: "Pinata JWT",
          },
        ],
      },
    },
  ]);
}

describe("parseConfigVarName", () => {
  it("parses qualified config names", () => {
    expect(parseConfigVarName("$std:tokenlist")).toEqual({
      module: "std",
      key: "tokenlist",
    });
    expect(parseConfigVarName("$aragonosx:pluginSetupProcessorBlock")).toEqual({
      module: "aragonosx",
      key: "pluginSetupProcessorBlock",
    });
    expect(parseConfigVarName("$access-control:someKey")).toEqual({
      module: "access-control",
      key: "someKey",
    });
  });

  it("returns null for plain, dotted and malformed names", () => {
    expect(parseConfigVarName("$tokenlist")).toBeNull();
    expect(parseConfigVarName("$token.tokenlist")).toBeNull();
    expect(parseConfigVarName("$std:ipfs.jwt")).toBeNull();
    expect(parseConfigVarName("$a:b:c")).toBeNull();
    expect(parseConfigVarName("$std:1key")).toBeNull();
  });
});

describe("readConfigValue", () => {
  it("prefers the set USER value over the default", () => {
    const bm = managerWithStd();
    bm.setBinding(
      "$std:tokenlist",
      "https://tokens.honeyswap.org",
      BindingsSpace.USER,
      true,
    );
    expect(readConfigValue(bm, "std", "tokenlist", { chainId: 100 })).toBe(
      "https://tokens.honeyswap.org",
    );
  });

  it("substitutes placeholders in the declared default", () => {
    const bm = managerWithStd();
    expect(readConfigValue(bm, "std", "tokenlist", { chainId: 100 })).toBe(
      "https://api.evmcrispr.com/tokenlist/100",
    );
  });

  it("throws when a placeholder has no substitution", () => {
    const bm = managerWithStd();
    expect(() => readConfigValue(bm, "std", "tokenlist")).toThrow(
      /\{chainId\}/,
    );
  });

  it("returns undefined when unset and no default is declared", () => {
    const bm = managerWithStd();
    expect(readConfigValue(bm, "std", "ipfsJwt")).toBeUndefined();
  });
});

describe("checkConfigAccess", () => {
  it("allows user origin and the owning module", () => {
    const bm = managerWithStd();
    expect(
      checkConfigAccess(bm, "std", "tokenlist", { kind: "user" }, "read").name,
    ).toBe("tokenlist");
    expect(
      checkConfigAccess(bm, "std", "tokenlist", undefined, "write").name,
    ).toBe("tokenlist");
    expect(
      checkConfigAccess(
        bm,
        "std",
        "tokenlist",
        { kind: "module", module: "std" },
        "read",
      ).name,
    ).toBe("tokenlist");
  });

  it("denies foreign module origins", () => {
    const bm = managerWithStd();
    expect(() =>
      checkConfigAccess(
        bm,
        "std",
        "ipfsJwt",
        { kind: "module", module: "mylib" },
        "read",
      ),
    ).toThrow(/only accessible to their own module/);
  });

  it("errors on unloaded module and undeclared key", () => {
    const bm = managerWithStd();
    expect(() =>
      checkConfigAccess(bm, "safe", "apiKey", { kind: "user" }, "read"),
    ).toThrow(/not loaded/);
    expect(() =>
      checkConfigAccess(bm, "std", "tokenList", { kind: "user" }, "write"),
    ).toThrow(/unknown config variable \$std:tokenList.*\$std:tokenlist/);
  });
});

describe("getConfigDef", () => {
  it("finds declared defs and misses undeclared ones", () => {
    const bm = managerWithStd();
    expect(getConfigDef(bm, "std", "ipfsJwt")?.type).toBe("string");
    expect(getConfigDef(bm, "std", "nope")).toBeUndefined();
    expect(getConfigDef(bm, "ghost", "x")).toBeUndefined();
  });
});
