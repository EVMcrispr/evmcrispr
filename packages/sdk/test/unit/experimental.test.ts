import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ExperimentalDisabledError } from "../../src/errors";
import type { CommandExpressionNode, NodesInterpreters } from "../../src/types";
import { defineCommand } from "../../src/utils/defineCommand";
import { defineHelper } from "../../src/utils/defineHelper";
import { defineModule } from "../../src/utils/defineModule";
import {
  EXPERIMENTAL_BADGE,
  isExperimentalEnabled,
  transformExperimentalMd,
} from "../../src/utils/experimental";

const savedEnv = process.env.VITE_PUBLIC_EXPERIMENTAL;
const setEnv = (value: string | undefined) => {
  if (value === undefined) delete process.env.VITE_PUBLIC_EXPERIMENTAL;
  else process.env.VITE_PUBLIC_EXPERIMENTAL = value;
};

beforeEach(() => setEnv(undefined));
afterEach(() => setEnv(savedEnv));

const interpreters: NodesInterpreters = {
  interpretNode: async (n: any) => n?.value,
  interpretNodes: async (ns: any[]) => ns.map((n) => n?.value),
};

const cmdNode = (opts: { name: string; value: any }[] = []) =>
  ({ name: "x", args: [], opts }) as unknown as CommandExpressionNode;

describe("isExperimentalEnabled", () => {
  it("is false when unset and true for 'true'/'1'", () => {
    expect(isExperimentalEnabled()).toBe(false);
    setEnv("true");
    expect(isExperimentalEnabled()).toBe(true);
    setEnv("1");
    expect(isExperimentalEnabled()).toBe(true);
    setEnv("false");
    expect(isExperimentalEnabled()).toBe(false);
  });
});

describe("defineCommand experimental gating", () => {
  const cmd = defineCommand({
    name: "expcmd",
    experimental: true,
    args: [],
    run: async () => [],
  });

  it("copies the flag onto the ICommand", () => {
    expect(cmd.experimental).toBe(true);
  });

  it("refuses to run while disabled, runs when enabled", async () => {
    await expect(cmd.run(null as any, cmdNode(), interpreters)).rejects.toThrow(
      ExperimentalDisabledError,
    );
    setEnv("true");
    await expect(
      cmd.run(null as any, cmdNode(), interpreters),
    ).resolves.toEqual([]);
  });

  it("rejects an experimental option while disabled", async () => {
    const withOpt = defineCommand({
      name: "stable",
      args: [],
      opts: [{ name: "extra", type: "string", experimental: true }],
      run: async () => [],
    });
    const node = cmdNode([{ name: "extra", value: { value: "v" } }]);
    await expect(withOpt.run(null as any, node, interpreters)).rejects.toThrow(
      /--extra.*experimental/,
    );
    setEnv("true");
    await expect(
      withOpt.run({ types: {} } as any, node, interpreters),
    ).resolves.toEqual([]);
  });
});

describe("defineHelper experimental gating", () => {
  const helper = defineHelper({
    name: "exph",
    experimental: true,
    args: [],
    run: async () => "ok",
  });

  it("refuses to run while disabled, runs when enabled", async () => {
    const h = { name: "exph", args: [] } as any;
    await expect(helper(null as any, h, interpreters)).rejects.toThrow(
      ExperimentalDisabledError,
    );
    setEnv("true");
    await expect(helper({ types: {} } as any, h, interpreters)).resolves.toBe(
      "ok",
    );
  });
});

describe("defineModule experimental filtering", () => {
  const commandImports = {
    stable: { load: async () => ({ default: {} as any }) },
    hidden: { load: async () => ({ default: {} as any }), experimental: true },
  };
  const helperImports = {
    visible: { load: async () => ({ default: (async () => "") as any }) },
    secret: {
      load: async () => ({ default: (async () => "") as any }),
      experimental: true,
    },
  };

  it("omits experimental entries while disabled and lists them", () => {
    const Ctor = defineModule("stub", commandImports, helperImports);
    const mod = new Ctor({} as any);
    expect(Object.keys(mod.commands)).toEqual(["stable"]);
    expect(Object.keys(mod.helpers)).toEqual(["visible"]);
    expect(mod.experimentalCommands).toEqual(["hidden"]);
    expect(mod.experimentalHelpers).toEqual(["secret"]);
    const data = mod.toModuleData();
    expect(data.experimentalCommands).toEqual(["hidden"]);
    expect(data.experimentalHelpers).toEqual(["secret"]);
  });

  it("interpretCommand/interpretHelper explain hidden experimental names", async () => {
    const Ctor = defineModule("stub", commandImports, helperImports);
    const mod = new Ctor({} as any);
    await expect(
      mod.interpretCommand({ name: "hidden" } as any, interpreters),
    ).rejects.toThrow(/experimental/);
    await expect(
      mod.interpretHelper({ name: "secret" } as any, interpreters),
    ).rejects.toThrow(/experimental/);
  });

  it("includes everything when enabled", () => {
    setEnv("true");
    const Ctor = defineModule("stub", commandImports, helperImports);
    const mod = new Ctor({} as any);
    expect(Object.keys(mod.commands).sort()).toEqual(["hidden", "stable"]);
    expect(Object.keys(mod.helpers).sort()).toEqual(["secret", "visible"]);
    expect(mod.experimentalCommands).toEqual([]);
    expect(mod.experimentalHelpers).toEqual([]);
  });
});

describe("transformExperimentalMd", () => {
  const md = [
    "intro",
    "",
    ":::experimental",
    "secret prose",
    "",
    "```evml",
    "load secret",
    "```",
    ":::",
    "",
    "outro",
  ].join("\n");

  it("strips blocks (fences and content) when disabled", () => {
    const out = transformExperimentalMd(md, false);
    expect(out).not.toContain("secret");
    expect(out).not.toContain(":::");
    expect(out).toContain("intro");
    expect(out).toContain("outro");
  });

  it("replaces the fences with the badge when enabled", () => {
    const out = transformExperimentalMd(md, true);
    expect(out).toContain(EXPERIMENTAL_BADGE);
    expect(out).toContain("secret prose");
    expect(out).toContain("load secret");
    expect(out).not.toContain(":::");
  });

  it("ignores ::: markers inside code fences", () => {
    const code = "```\n:::experimental\nnot a fence\n:::\n```";
    expect(transformExperimentalMd(code, false)).toBe(code);
    expect(transformExperimentalMd(code, true)).toBe(code);
  });

  it("drops ⚗️-marked table rows only when disabled", () => {
    const table = [
      "| Name | Description |",
      "|------|-------------|",
      "| `--stable` | Always available |",
      "| `--from` ⚗️ | Experimental option |",
    ].join("\n");
    const off = transformExperimentalMd(table, false);
    expect(off).toContain("--stable");
    expect(off).not.toContain("--from");
    expect(transformExperimentalMd(table, true)).toBe(table);
  });

  it("leaves markdown without blocks untouched", () => {
    expect(transformExperimentalMd("plain\ntext", false)).toBe("plain\ntext");
  });
});
