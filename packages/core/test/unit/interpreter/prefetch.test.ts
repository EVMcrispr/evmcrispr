import { describe, expect, it } from "bun:test";
import { prefetchScript, scriptNeeds } from "../../../src/interpreter/prefetch";
import { parseScript } from "../../../src/parsers/script";

const needsOf = (script: string) => scriptNeeds(parseScript(script).ast.body);

describe("scriptNeeds", () => {
  it("names the loaded modules, commands and helpers, inside blocks too", () => {
    const needs = needsOf(
      [
        "load token",
        "load sim",
        "set $a @ens(vitalik.eth)",
        "sim:fork (",
        '  exec $a "transfer(address,uint256)" @me @token:amount($a 1)',
        ")",
      ].join("\n"),
    );
    expect([...needs.modules].sort()).toEqual(["sim", "token"]);
    expect([...needs.commands].sort()).toEqual(["exec", "fork", "load", "set"]);
    expect([...needs.helpers].sort()).toEqual(["amount", "ens", "me"]);
  });

  it("leaves out a module the script provides itself", () => {
    const needs = needsOf(
      "load mine --from bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    );
    expect([...needs.modules]).toEqual([]);
  });
});

describe("prefetchScript", () => {
  it("asks for every piece at once, without waiting for any", async () => {
    const asked: string[] = [];
    const never = (name: string) => () => {
      asked.push(name);
      return new Promise<unknown>(() => {});
    };
    let releaseToken!: (mod: unknown) => void;
    const tokenModule = new Promise<unknown>((resolve) => {
      releaseToken = resolve;
    });
    prefetchScript(
      needsOf("load token\nload sim\nset $x @token:amount($y 1)"),
      {
        std: {
          commands: { set: never("std:set"), load: never("std:load") },
          helpers: {},
        },
        moduleLoader: (name) =>
          name === "token"
            ? () => {
                asked.push("token");
                return tokenModule;
              }
            : name === "sim"
              ? never("sim")
              : undefined,
      },
    );
    // Both modules and both std commands were asked for before any answered.
    expect(asked.sort()).toEqual(["sim", "std:load", "std:set", "token"]);

    // Once a module's code arrives, the commands and helpers it has that
    // the script names are asked for too.
    releaseToken({
      default: {
        commandLoaders: { approve: never("token:approve") },
        helperLoaders: { amount: never("token:amount") },
      },
    });
    await tokenModule;
    await Promise.resolve();
    expect(asked).toContain("token:amount");
    expect(asked).not.toContain("token:approve");
  });

  it("leaves already defined commands and helpers alone", () => {
    let called = false;
    // A helper function itself (3+ parameters), not a loader: calling it
    // would run the helper.
    const helper = (_module: unknown, _node: unknown, _args: unknown) => {
      called = true;
    };
    expect(() =>
      prefetchScript(needsOf("set $x @me"), {
        std: {
          commands: { set: { name: "set" } as never },
          helpers: { me: helper as never },
        },
        moduleLoader: () => undefined,
      }),
    ).not.toThrow();
    expect(called).toBe(false);
  });

  it("never throws or rejects, whatever a loader does", async () => {
    const failing = () => Promise.reject(new Error("offline"));
    expect(() =>
      prefetchScript(needsOf("load token\nset $x 1"), {
        std: { commands: { set: failing, load: failing }, helpers: {} },
        moduleLoader: () => failing,
      }),
    ).not.toThrow();
    // Give the rejections a turn: an unhandled one would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
