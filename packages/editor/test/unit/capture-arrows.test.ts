import { describe, expect, it } from "bun:test";
import { createLanguage } from "../../src/editor/evml";
import grammar from "../../src/grammars/evml.tmLanguage.json";

/** The four error-capture arrows, longest first — the order a scanner has
 *  to try them in so `-?/>` is never read as `-?` followed by `/>`. */
const ARROWS = ["-?/>", "-/>", "-?!>", "-!>"] as const;

describe("capture arrows", () => {
  const patterns = grammar.repository.operator.patterns as {
    match: string;
    name: string;
  }[];

  it("gives each capture arrow its own tmLanguage operator scope", () => {
    const byArrow = (arrow: string) =>
      patterns.find((p) => new RegExp(`^(?:${p.match})$`).test(arrow));
    expect(byArrow("-?/>")?.name).toBe(
      "keyword.operator.refusal-capture-optional.evml",
    );
    expect(byArrow("-/>")?.name).toBe("keyword.operator.refusal-capture.evml");
    expect(byArrow("-?!>")?.name).toBe(
      "keyword.operator.error-capture-optional.evml",
    );
    expect(byArrow("-!>")?.name).toBe("keyword.operator.error-capture.evml");
  });

  it("matches every arrow whole, longest first", () => {
    for (const arrow of ARROWS) {
      // The first pattern that matches at the start of the arrow has to
      // consume all of it — otherwise `-?/>` highlights as two tokens.
      const first = patterns.find((p) =>
        new RegExp(`^(?:${p.match})`).test(arrow),
      );
      expect(first, arrow).toBeDefined();
      const matched = new RegExp(`^(?:${first!.match})`).exec(arrow)![0];
      expect(matched, arrow).toBe(arrow);
    }
  });

  it("orders the tmLanguage arrow patterns longest first", () => {
    const indexOfArrow = (arrow: string) =>
      patterns.findIndex((p) => new RegExp(`^(?:${p.match})$`).test(arrow));
    const arrowIndex = patterns.findIndex((p) =>
      new RegExp(`^(?:${p.match})$`).test("->"),
    );
    expect(indexOfArrow("-?/>")).toBeLessThan(indexOfArrow("-/>"));
    expect(indexOfArrow("-/>")).toBeLessThan(indexOfArrow("-?!>"));
    expect(indexOfArrow("-?!>")).toBeLessThan(indexOfArrow("-!>"));
    expect(indexOfArrow("-!>")).toBeLessThan(arrowIndex);
  });

  it("tokenizes every arrow as one Monarch operator", () => {
    const language = createLanguage(["exec"], []);
    const rules = language.tokenizer!.expression as {
      regex: string | RegExp;
      action?: { token?: string };
    }[];
    for (const arrow of ARROWS) {
      // Monarch tries the rules of a state in order and anchors each one
      // at the cursor, so the first rule matching at index 0 wins.
      const rule = rules.find((r) => {
        const source = typeof r.regex === "string" ? r.regex : r.regex.source;
        return new RegExp(`^(?:${source})`).test(arrow);
      });
      expect(rule, arrow).toBeDefined();
      const source =
        typeof rule!.regex === "string" ? rule!.regex : rule!.regex.source;
      expect(new RegExp(`^(?:${source})`).exec(arrow)![0], arrow).toBe(arrow);
      expect(rule!.action?.token, arrow).toBe("operator");
    }
  });
});
