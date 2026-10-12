import { describe, expect, it } from "bun:test";
import "../../setup.js";

import { wrapScript } from "../../../src/evml/simulate";

const FROM = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("simulateScript's wrapper", () => {
  it("names the account with --as, never the deprecated --from", () => {
    expect(
      wrapScript("print 1", {
        from: FROM,
        blockNumber: 5,
        using: "ethereumjs",
      }),
    ).toBe(
      `load sim\nsim:fork --block-number 5 --as ${FROM} --using ethereumjs (\nprint 1\n)`,
    );
  });

  it("names no account when none is given", () => {
    expect(wrapScript("print 1", {})).toBe("load sim\nsim:fork (\nprint 1\n)");
  });

  it("forks the chain the script's leading bare switch names", () => {
    expect(wrapScript("switch gnosis\nprint 1", {})).toBe(
      "load sim\nsim:fork --on gnosis (\nswitch gnosis\nprint 1\n)",
    );
    expect(wrapScript("switch 10\nprint 1", { blockNumber: 5 })).toBe(
      "load sim\nsim:fork --on 10 --block-number 5 (\nswitch 10\nprint 1\n)",
    );
  });

  it("takes the account from the leading switch when no from is given", () => {
    expect(wrapScript(`switch gnosis --as ${FROM}\nprint 1`, {})).toBe(
      `load sim\nsim:fork --on gnosis --as ${FROM} (\nswitch gnosis --as ${FROM}\nprint 1\n)`,
    );
    expect(wrapScript(`switch --as ${FROM}`, {})).toBe(
      `load sim\nsim:fork --as ${FROM} (\nswitch --as ${FROM}\n)`,
    );
  });

  it("prefers the from it is given", () => {
    const OTHER = "0x1111111111111111111111111111111111111111";
    expect(wrapScript(`switch gnosis --as ${FROM}`, { from: OTHER })).toBe(
      `load sim\nsim:fork --on gnosis --as ${OTHER} (\nswitch gnosis --as ${FROM}\n)`,
    );
  });

  it("reads nothing from a switch that is not leading, bare and literal", () => {
    for (const script of [
      "print 1\nswitch gnosis",
      "switch gnosis (\n  print 1\n)",
      "switch $chain",
      "switch --as @me",
      "switch notachain",
    ]) {
      expect(wrapScript(script, {})).toBe(`load sim\nsim:fork (\n${script}\n)`);
    }
  });
});
