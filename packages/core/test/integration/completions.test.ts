import { describe, it } from "bun:test";
import { expect, getTransports } from "@evmcrispr/test-utils";
import { TestContext } from "@evmcrispr/test-utils/evml";
import type { Transport } from "viem";
import { gnosis } from "viem/chains";
import { evml } from "../../src";
import { customErrorContract } from "../setup";

describe("Core > completions", () => {
  const ctx = new TestContext();

  describe("command name completions", () => {
    it("should suggest std commands on an empty line", async () => {
      const script = "";
      const result = await ctx.completions(script, { line: 1, col: 0 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("set");
      expect(labels).to.include("load");
      expect(labels).to.include("exec");
    });

    it("should suggest commands when typing a partial name", async () => {
      const script = "se";
      const result = await ctx.completions(script, { line: 1, col: 2 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("set");
    });

    it("should suppress completions inside a heredoc block", async () => {
      const script =
        "set $src <<<SOL\npragma solidity 0.8.26;\ncon\nSOL\nprint $src";
      const inside = await ctx.completions(script, { line: 3, col: 3 });
      expect(inside).to.eql([]);
      // …but lines after the closing sentinel complete normally again.
      const after = await ctx.completions(script, { line: 5, col: 5 });
      expect(after).to.be.an("array");
    });
  });

  describe("helper completions", () => {
    it("should suggest helpers after @", async () => {
      const script = "set $x @";
      const result = await ctx.completions(script, { line: 1, col: 8 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("@me");
      expect(labels).to.include("@token");
    });

    it("should return an array for partial helper input", async () => {
      const script = "set $x @to";
      const result = await ctx.completions(script, { line: 1, col: 10 });
      expect(result).to.be.an("array");
    });
  });

  describe("variable completions", () => {
    it("should suggest previously set variables", async () => {
      const script = "set $myVar 42\nset $other $";
      const result = await ctx.completions(script, { line: 2, col: 12 });
      expect(result).to.be.an("array");
      if (result.length > 0) {
        const labels = result.map((c) => c.label);
        expect(labels).to.include("$myVar");
      }
    });
  });

  describe("cross-module completions", () => {
    it("should include helpers from a loaded module (qualified)", async () => {
      // Uses the `coretest` stub registered in test/setup.ts so the
      // assertion verifies the cross-module loading machinery itself
      // without coupling the core package to any concrete module.
      const script = "load coretest\nset $x @";
      const result = await ctx.completions(script, { line: 2, col: 8 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("@coretest:coretest-helper");
    });

    it("should offer the unqualified spelling for import-listed helpers", async () => {
      const script = "load coretest [@coretest-helper]\nset $x @";
      const result = await ctx.completions(script, { line: 2, col: 8 });
      expect(result).to.be.an("array");
      const labels = result.map((c) => c.label);
      expect(labels).to.include("@coretest-helper");
    });
  });

  describe("edge cases", () => {
    it("should return empty array for out-of-bounds position", async () => {
      const script = "set $x 1";
      const result = await ctx.completions(script, { line: 100, col: 0 });
      expect(result).to.be.an("array");
    });
  });

  describe("config variable completions", () => {
    it("offers declared configs of loaded modules in set's binding slot", async () => {
      const script = "load coretest\nset ";
      const items = await ctx.completions(script, { line: 2, col: 4 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("$std:tokenlist");
      expect(labels).to.include("$coretest:endpoint");
      // std declares them, so metadata rides along
      const endpoint = items.find((c) => c.label === "$coretest:endpoint");
      expect(endpoint?.detail).to.include("default: https://example.com");
    });

    it("does not offer configs of unloaded modules", async () => {
      const script = "set ";
      const items = await ctx.completions(script, { line: 1, col: 4 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("$std:tokenlist");
      expect(labels).to.not.include("$coretest:endpoint");
    });

    it("does not offer unset config vars in read positions", async () => {
      const script = "load coretest\nset $x ";
      const items = await ctx.completions(script, { line: 2, col: 7 });
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("$coretest:endpoint");
    });

    it("offers a config var in read positions once it has been set", async () => {
      const script =
        'load coretest\nset $coretest:endpoint "https://x"\nset $y ';
      const items = await ctx.completions(script, { line: 3, col: 7 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("$coretest:endpoint");
    });
  });

  describe("named-arg completions", () => {
    it("offers name: items for unused optional helper args", async () => {
      const script = "set $x @date(now )";
      const items = await ctx.completions(script, { line: 1, col: 17 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("offset:");
      const item = items.find((c) => c.label === "offset:");
      expect(item!.kind).to.equal("field");
      expect(item!.insertText).to.equal("offset:");
    });

    it("does not offer a name already used", async () => {
      const script = "set $x @date(now offset:+1d )";
      const items = await ctx.completions(script, { line: 1, col: 28 });
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("offset:");
    });

    it("does not offer a name filled positionally", async () => {
      const script = "set $x @date(now +1d )";
      const items = await ctx.completions(script, { line: 1, col: 21 });
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("offset:");
    });
  });

  describe("error capture completions", () => {
    /** End of the given (1-indexed) line — where the user is typing. */
    const endOf = (script: string, line: number) => ({
      line,
      col: script.split("\n")[line - 1].length,
    });

    const labelsOf = async (script: string, line: number) =>
      (await ctx.completions(script, endOf(script, line))).map((c) => c.label);

    it("offers the command's declared errors after -!>", async () => {
      const script = "load coretest\ncoretest:risky -!> ";
      const items = await ctx.completions(script, endOf(script, 2));
      const labels = items.map((c) => c.label);
      expect(labels).to.include("BelowMinimum");
      expect(labels).to.include("SameToken");

      const below = items.find((c) => c.label === "BelowMinimum")!;
      expect(below.documentation).to.include(
        "A part is worth less than the minimum order value",
      );
      expect(below.detail).to.equal("BelowMinimum(uint256)");
      // The destructure template comes from the declared fields.
      expect(below.insertText).to.equal("BelowMinimum [$minimum]");
      // A fieldless error inserts just its name.
      expect(items.find((c) => c.label === "SameToken")!.insertText).to.equal(
        "SameToken",
      );
    });

    it("offers the same declarations after -?!>", async () => {
      const script = "load coretest\ncoretest:risky -?!> ";
      const labels = await labelsOf(script, 2);
      expect(labels).to.include("BelowMinimum");
      expect(labels).to.include("SameToken");
    });

    it("offers a helper's declared errors after either arrow", async () => {
      for (const arrow of ["-!>", "-?!>"]) {
        const script = `load coretest\ncoretest:risky @coretest:hfail() ${arrow} `;
        const items = await ctx.completions(script, endOf(script, 2));
        const noExplorer = items.find((c) => c.label === "NoExplorer");
        expect(noExplorer, `helper error missing after ${arrow}`).to.not.be
          .undefined;
        expect(noExplorer!.insertText).to.equal("NoExplorer [$chain]");
        expect(noExplorer!.documentation).to.include(
          "The chain has no supported explorer",
        );
      }
    });

    it("orders command declarations, then helper declarations, then the builtins", async () => {
      const script = "load coretest\ncoretest:risky @coretest:hfail() -!> ";
      const labels = await labelsOf(script, 2);
      expect(labels.indexOf("BelowMinimum")).to.be.greaterThan(-1);
      expect(labels.indexOf("BelowMinimum")).to.be.lessThan(
        labels.indexOf("NoExplorer"),
      );
      expect(labels.indexOf("NoExplorer")).to.be.lessThan(
        labels.indexOf("Error(string)"),
      );
    });

    it("always offers the Solidity builtins", async () => {
      const script =
        'exec 0x00000000000000000000000000000000000c0de5 "risk(uint256)" 1 -!> ';
      const items = await ctx.completions(script, endOf(script, 1));
      const labels = items.map((c) => c.label);
      expect(labels).to.include("Error(string)");
      expect(labels).to.include("Panic(uint256)");
      expect(
        items.find((c) => c.label === "Error(string)")!.insertText,
      ).to.equal("Error(string) [$reason]");
    });

    it("keeps offering names while one is being typed", async () => {
      const script = "load coretest\ncoretest:risky -!> Belo";
      const labels = await labelsOf(script, 2);
      expect(labels).to.include("BelowMinimum");
    });

    it("offers an ambiguous name only as explicit signatures", async () => {
      const script = "load coretest\ncoretest:risky @coretest:hfail() -!> ";
      const items = await ctx.completions(script, endOf(script, 2));
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("Shared");
      expect(labels).to.include("Shared(uint256)");
      expect(labels).to.include("Shared()");
      expect(
        items.find((c) => c.label === "Shared(uint256)")!.insertText,
      ).to.equal("Shared(uint256) [$code]");
    });

    it("dedupes a signature declared by both the command and a helper", async () => {
      const script = "load coretest\ncoretest:risky @coretest:hfail() -!> ";
      const labels = await labelsOf(script, 2);
      expect(labels.filter((l) => l === "Twin")).to.have.lengthOf(1);
    });

    it("does not offer error names in a destructure position", async () => {
      const script = "load coretest\ncoretest:risky -!> BelowMinimum [";
      const labels = await labelsOf(script, 2);
      expect(labels).to.not.include("SameToken");
      expect(labels).to.not.include("Error(string)");
    });

    it("does not offer error names once the clause has its name", async () => {
      const script = "load coretest\ncoretest:risky -!> BelowMinimum ";
      const labels = await labelsOf(script, 2);
      expect(labels).to.not.include("SameToken");
    });

    it("ignores an arrow inside a string", async () => {
      const script = 'load coretest\ncoretest:risky "text -!> Bel';
      const labels = await labelsOf(script, 2);
      expect(labels).to.not.include("BelowMinimum");
    });

    it("ignores an arrow inside a comment", async () => {
      // A comment opens at any `#` a bareword stopped at, not only at one
      // that starts a token — `foo#note` is `foo` followed by a comment —
      // and its text may well start with a digit.
      for (const line of [
        "coretest:risky # -!> Bel",
        "coretest:risky foo#note -!> Bel",
        "coretest:risky foo#2nd -!> Bel",
        "#2 not an occurrence selector -!> Bel",
      ]) {
        const script = `load coretest\n${line}`;
        const labels = await labelsOf(script, 2);
        expect(labels, line).to.not.include("BelowMinimum");
      }
    });

    it("still sees an arrow after an event capture's occurrence selector", async () => {
      const script =
        "load coretest\ncoretest:risky -> Transfer#2 [$to] -!> Bel";
      const labels = await labelsOf(script, 2);
      expect(labels).to.include("BelowMinimum");
    });

    it("does not carry an arrow over from an earlier line", async () => {
      const script =
        "load coretest\ncoretest:risky -!> SameToken\ncoretest:risky ";
      const labels = await labelsOf(script, 3);
      expect(labels).to.not.include("BelowMinimum");
      expect(labels).to.not.include("Error(string)");
    });

    // --- contract errors: cached ABIs only, never a fetch -----------------

    const captureScript = `exec ${customErrorContract.address} "risk(uint256)" 1 -!> `;

    /** Count every network attempt a request makes: `fetch` (the ABI
     *  endpoint and viem's http transport both go through it) and the
     *  viem transports the workspace was built with. */
    const countingWorkspace = () => {
      let requests = 0;
      const base = getTransports();
      const transports: Record<number, Transport> = {};
      for (const [id, transport] of Object.entries(base)) {
        transports[Number(id)] = ((config: any) => {
          const instance = (transport as any)(config);
          return {
            ...instance,
            request: async (args: any) => {
              requests++;
              return instance.request(args);
            },
          };
        }) as Transport;
      }
      const workspace = evml
        .with({ chainId: gnosis.id, transports })
        .workspace();
      const offline = async <T>(fn: () => Promise<T>): Promise<T> => {
        const originalFetch = globalThis.fetch;
        requests = 0;
        let fetches = 0;
        globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
          fetches++;
          return originalFetch(...args);
        }) as typeof fetch;
        try {
          const result = await fn();
          expect(fetches, "capture completions fetched over HTTP").to.equal(0);
          expect(requests, "capture completions made an RPC request").to.equal(
            0,
          );
          return result;
        } finally {
          globalThis.fetch = originalFetch;
        }
      };
      return { workspace, offline };
    };

    it("offers a cached contract's custom errors without fetching", async () => {
      const { workspace, offline } = countingWorkspace();
      // Warm the editor's ABI cache the way the signature slot does.
      const warm = `exec ${customErrorContract.address} `;
      await workspace.getCompletions(warm, endOf(warm, 1));

      const items = await offline(() =>
        workspace.getCompletions(captureScript, endOf(captureScript, 1)),
      );
      const labels = items.map((c) => c.label);
      expect(labels).to.include("NotEnough(uint256,uint256)");
      expect(
        items.find((c) => c.label === "NotEnough(uint256,uint256)")!.insertText,
      ).to.equal("NotEnough(uint256,uint256) [$available $required]");
      // Declared/builtin entries still come first.
      expect(labels.indexOf("Error(string)")).to.be.lessThan(
        labels.indexOf("NotEnough(uint256,uint256)"),
      );
    });

    it("offers no contract errors — and fetches nothing — with a cold cache", async () => {
      const { workspace, offline } = countingWorkspace();
      const items = await offline(() =>
        workspace.getCompletions(captureScript, endOf(captureScript, 1)),
      );
      const labels = items.map((c) => c.label);
      expect(labels).to.not.include("NotEnough(uint256,uint256)");
      expect(labels).to.include("Error(string)");
    });
  });

  describe("inline module completions", () => {
    it("offers qualified spellings for inline module defs", async () => {
      const script = `def module math (
  def @double "$n: number -> number" @num($n * 2)
  def show "$a: string" (
    print $a
  )
)
`;
      const items = await ctx.completions(script, { line: 7, col: 0 });
      const labels = items.map((c) => c.label);
      expect(labels).to.include("math:show");
      const helperItems = await ctx.completions(`${script}print `, {
        line: 7,
        col: 6,
      });
      const helperLabels = helperItems.map((c) => c.label);
      expect(helperLabels).to.include("@math:double");
    });
  });
});
