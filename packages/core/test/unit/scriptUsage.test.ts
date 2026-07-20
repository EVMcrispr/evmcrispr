import "../setup";

import { describe, it } from "bun:test";
import { expect } from "@evmcrispr/test-utils";

import { collectScriptUsage } from "../../src";

const usage = (script: string) => {
  const u = collectScriptUsage(script);
  expect(u).to.not.be.null;
  return u!;
};

describe("collectScriptUsage", () => {
  it("returns empty sets for an empty script", () => {
    const u = usage("");
    expect([...u.commands]).to.deep.equal([]);
    expect([...u.helpers]).to.deep.equal([]);
    expect([...u.configVars]).to.deep.equal([]);
  });

  it("ignores words in comments", () => {
    const u = usage("# deposit funds\n# exec @token(WETH) with $std:tokenlist");
    expect([...u.commands]).to.deep.equal([]);
    expect([...u.helpers]).to.deep.equal([]);
    expect([...u.configVars]).to.deep.equal([]);
  });

  it("ignores words inside string literals", () => {
    const u = usage('print "deposit @me"');
    expect([...u.commands]).to.deep.equal(["std:print"]);
    expect([...u.helpers]).to.deep.equal([]);
  });

  it("resolves unqualified commands to std", () => {
    const u = usage("set $a 1");
    expect([...u.commands]).to.deep.equal(["std:set"]);
  });

  it("collects qualified commands and helpers even without a load", () => {
    const u = usage("lending:deposit @token(DAI) 1");
    expect([...u.commands]).to.deep.equal(["lending:deposit"]);
    expect([...u.helpers]).to.deep.equal(["std:token"]);
  });

  it("collects qualified helpers", () => {
    const u = usage("print @lending:apy(aave-v3 DAI)");
    expect(u.helpers.has("lending:apy")).to.be.true;
  });

  it("resolves commands bound via a load import list", () => {
    const u = usage("load lending [deposit]\ndeposit @token(DAI) 1");
    expect(u.commands.has("std:load")).to.be.true;
    expect(u.commands.has("lending:deposit")).to.be.true;
    expect(u.commands.has("std:deposit")).to.be.false;
  });

  it("resolves import renames to the source name", () => {
    const u = usage("load lending [deposit>dep]\ndep 1");
    expect(u.commands.has("lending:deposit")).to.be.true;
    expect(u.commands.has("std:dep")).to.be.false;
  });

  it("resolves helpers bound via a load import list", () => {
    const u = usage("load lending [@apy]\nprint @apy(aave-v3 DAI)");
    expect(u.helpers.has("lending:apy")).to.be.true;
    expect(u.helpers.has("std:apy")).to.be.false;
  });

  it("does not count import-list entries as usage", () => {
    const u = usage("load lending [deposit @apy]");
    expect(u.commands.has("lending:deposit")).to.be.false;
    expect(u.helpers.has("lending:apy")).to.be.false;
    expect(u.helpers.has("std:apy")).to.be.false;
    expect([...u.commands]).to.deep.equal(["std:load"]);
  });

  it("collects helpers nested in arrays, calls and opts", () => {
    const u = usage(
      'exec @token(WETH) "transfer(address,uint256)" [@me @num(1 18)] --from @account(1)',
    );
    expect(u.commands.has("std:exec")).to.be.true;
    expect(u.helpers.has("std:token")).to.be.true;
    expect(u.helpers.has("std:me")).to.be.true;
    expect(u.helpers.has("std:num")).to.be.true;
    expect(u.helpers.has("std:account")).to.be.true;
  });

  it("collects commands inside nested blocks", () => {
    const u = usage("sim:fork (\n  lending:deposit 1\n  set $a 1\n)");
    expect(u.commands.has("sim:fork")).to.be.true;
    expect(u.commands.has("lending:deposit")).to.be.true;
    expect(u.commands.has("std:set")).to.be.true;
  });

  it("does not attribute def-defined commands to modules", () => {
    const u = usage('def greet "()" (\n  set $x 1\n)\ngreet');
    expect(u.commands.has("std:def")).to.be.true;
    expect(u.commands.has("std:set")).to.be.true;
    expect(u.commands.has("std:greet")).to.be.false;
  });

  it("does not attribute def-defined helpers to std, but counts body usage", () => {
    const u = usage(
      'def @double "$n: number -> number" @num($n * 2)\nprint @double(2)',
    );
    expect(u.commands.has("std:def")).to.be.true;
    expect(u.helpers.has("std:double")).to.be.false;
    expect(u.helpers.has("std:num")).to.be.true;
  });

  it("collects config variables on reads and writes", () => {
    const u = usage(
      'set $std:tokenlist "https://example.com"\nprint $safe:apiKey',
    );
    expect(u.configVars.has("std:tokenlist")).to.be.true;
    expect(u.configVars.has("safe:apiKey")).to.be.true;
  });

  it("does not collect plain variables as config vars", () => {
    const u = usage("set $x 1\nprint $x");
    expect([...u.configVars]).to.deep.equal([]);
  });

  it("collects config vars nested in helper args", () => {
    const u = usage("print @get($std:tokenlist name)");
    expect(u.configVars.has("std:tokenlist")).to.be.true;
    expect(u.helpers.has("std:get")).to.be.true;
  });

  it("returns null only when the script cannot be parsed at all", () => {
    // Broken lines are recovered per-line; the rest still parses.
    const u = collectScriptUsage("set $a 1\nlending:deposit ((");
    expect(u).to.not.be.null;
    expect(u!.commands.has("std:set")).to.be.true;
  });
});
