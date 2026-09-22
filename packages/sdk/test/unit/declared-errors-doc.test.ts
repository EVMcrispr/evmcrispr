import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { normalizeDeclaredErrors } from "../../src/utils/declaredErrors";
import {
  loadDeclaredErrors,
  renderDeclaredErrorsSection,
} from "../../src/utils/declaredErrorsDoc";

const FIXTURES = join(import.meta.dirname, "../fixtures/declared-errors-doc");

function fixture(name: string): string {
  return join(FIXTURES, name);
}

describe("declared errors documentation", () => {
  describe("renderDeclaredErrorsSection", () => {
    it("renders nothing when a definition declares no errors", () => {
      expect(renderDeclaredErrorsSection(undefined, "command")).toEqual([]);
      expect(renderDeclaredErrorsSection({}, "command")).toEqual([]);
    });

    it("renders a signature table and a link to the captures page", () => {
      const md = renderDeclaredErrorsSection(
        normalizeDeclaredErrors({
          SameToken: { description: "The sell and buy token are the same" },
        }),
        "command",
      ).join("\n");

      expect(md).toContain("## Errors");
      expect(md).toContain("/language/captures/");
      expect(md).toContain(
        "| `SameToken()` | The sell and buy token are the same |",
      );
    });

    it("renders an ordered field table for errors with fields", () => {
      const md = renderDeclaredErrorsSection(
        normalizeDeclaredErrors({
          BelowMinimum: {
            description: "A part is worth less than the minimum",
            fields: [
              {
                name: "minimum",
                type: "number",
                description: "Minimum per part",
              },
              {
                name: "funder",
                type: "address",
                description: "Account charged",
              },
            ],
          },
        }),
        "command",
      ).join("\n");

      expect(md).toContain("| `BelowMinimum(uint256,address)` |");
      expect(md).toContain("| 1 | `minimum` | `number` | Minimum per part |");
      expect(md).toContain("| 2 | `funder` | `address` | Account charged |");
    });

    it("keeps declaration order and only tables the errors with fields", () => {
      const md = renderDeclaredErrorsSection(
        normalizeDeclaredErrors({
          First: { description: "one" },
          Second: {
            description: "two",
            fields: [{ name: "count", type: "number" }],
          },
        }),
        "command",
      ).join("\n");

      expect(md.indexOf("`First()`")).toBeLessThan(md.indexOf("`Second("));
      expect(md).toContain("`Second(uint256)` fields");
      expect(md).not.toContain("`First()` fields");
      // A field with no description leaves the cell empty.
      expect(md).toContain("| 1 | `count` | `number` |  |");
    });

    it("escapes table-breaking characters in descriptions", () => {
      const md = renderDeclaredErrorsSection(
        normalizeDeclaredErrors({
          Weird: {
            description: "a | b, and <html> too\nover two lines",
            fields: [
              { name: "x", type: "string", description: "a | b <script>" },
            ],
          },
        }),
        "command",
      ).join("\n");

      expect(md).toContain(
        "| `Weird(string)` | a \\| b, and &lt;html&gt; too over two lines |",
      );
      expect(md).toContain("| 1 | `x` | `string` | a \\| b &lt;script&gt; |");
      // Cell content never adds a column: the two-column error row keeps 3
      // unescaped separators and the four-column field row keeps 5.
      const separators = (row: string) =>
        (row.replace(/\\\|/g, "").match(/\|/g) ?? []).length;
      const rows = md.split("\n").filter((l) => l.startsWith("| "));
      expect(rows.map(separators)).toEqual([3, 3, 5, 5]);
      for (const row of rows) expect(row).not.toMatch(/[<>]/);
    });

    it("says where a helper's errors are captured", () => {
      const md = renderDeclaredErrorsSection(
        normalizeDeclaredErrors({ NoExplorer: { description: "no explorer" } }),
        "helper",
      ).join("\n");

      expect(md).toContain("## Errors");
      expect(md).toMatch(/command line/);
    });
  });

  describe("loadDeclaredErrors", () => {
    it("reads the normalized errors of a command definition", async () => {
      const errors = await loadDeclaredErrors(fixture("command.ts"));
      expect(Object.keys(errors ?? {})).toEqual(["NoQuote", "BelowMinimum"]);
      expect(errors?.NoQuote.description).toBe("The venue declined the order");
      // Normalization fills in the empty field list.
      expect(errors?.NoQuote.fields).toEqual([]);
      expect(errors?.BelowMinimum.fields[0]).toEqual({
        name: "minimum",
        type: "number",
        description: "Minimum per part",
      });
    });

    it("reads errors a shared block spreads into the definition", async () => {
      const errors = await loadDeclaredErrors(fixture("command.ts"));
      const shared = await loadDeclaredErrors(fixture("helper.ts"));
      expect(shared?.NoQuote).toBeDefined();
      expect(errors?.NoQuote).toEqual(shared?.NoQuote);
    });

    it("reads the errors of a helper definition", async () => {
      const errors = await loadDeclaredErrors(fixture("helper.ts"));
      expect(Object.keys(errors ?? {})).toEqual(["NoQuote"]);
    });

    it("reads an empty block from a definition that declares nothing", async () => {
      expect(await loadDeclaredErrors(fixture("no-errors.ts"))).toEqual({});
    });

    it("fails with the file path when the definition cannot be loaded", async () => {
      const path = fixture("broken.ts");
      await expect(loadDeclaredErrors(path)).rejects.toThrow(
        new RegExp(`${path}[\\s\\S]*boom at import time`),
      );
    });

    it("fails with the file path when there is no definition to read", async () => {
      const path = fixture("no-default.ts");
      await expect(loadDeclaredErrors(path)).rejects.toThrow(
        new RegExp(`${path}[\\s\\S]*default export`),
      );
    });
  });
});
