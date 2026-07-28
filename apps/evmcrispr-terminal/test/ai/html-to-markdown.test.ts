import { describe, expect, test } from "bun:test";

import { htmlToMarkdown } from "../../src/ai/html-to-markdown";
import { PAGE_CHAR_BUDGET, truncate } from "../../src/ai/web-tools";

const PAGE = `<!DOCTYPE html>
<html>
<head><title>ENS Registry</title></head>
<body>
  <nav><a href="/">Home</a><a href="/docs">Docs</a>NAVIGATION-CHROME</nav>
  <article>
    <h1>The ENS Registry</h1>
    <p>The registry is the <strong>core contract</strong> of ENS. It keeps a
    record of every name and its owner. This paragraph is long enough for
    Readability to consider the article meaningful content, describing how the
    registry maps names to resolvers and owners across the naming system.</p>
    <h2>Functions</h2>
    <p>The <code>owner(bytes32 node)</code> function returns the owner.
    Records can be updated by their owners at any time, and resolution is
    delegated to resolver contracts configured per name.</p>
    <table>
      <thead><tr><th>Function</th><th>Returns</th></tr></thead>
      <tbody><tr><td>owner</td><td>address</td></tr></tbody>
    </table>
    <p>See <a href="https://docs.ens.domains/registry">the docs</a> for more.</p>
  </article>
  <footer>FOOTER-CHROME</footer>
</body>
</html>`;

describe("htmlToMarkdown", () => {
  test("extracts article content as markdown, dropping page chrome", async () => {
    const md = await htmlToMarkdown(PAGE, "https://docs.ens.domains/registry");

    expect(md).toContain("Source: https://docs.ens.domains/registry");
    expect(md).toContain("core contract");
    expect(md).toContain("`owner(bytes32 node)`");
    expect(md).toContain("[the docs](https://docs.ens.domains/registry)");
    expect(md).not.toContain("NAVIGATION-CHROME");
    expect(md).not.toContain("FOOTER-CHROME");
    expect(md).not.toContain("<p>");
  });

  test("falls back to stripped body when there is no article", async () => {
    const md = await htmlToMarkdown(
      `<html><head><title>Tiny</title></head><body>
        <script>alert(1)</script><nav>MENU</nav><p>Just a line.</p>
      </body></html>`,
      "https://example.com",
    );

    expect(md).toContain("Just a line.");
    expect(md).not.toContain("MENU");
    expect(md).not.toContain("alert(1)");
  });
});

describe("truncate", () => {
  test("leaves short text untouched", () => {
    expect(truncate("short")).toBe("short");
  });

  test("cuts at the budget and appends a notice", () => {
    const long = "a".repeat(PAGE_CHAR_BUDGET + 500);
    const out = truncate(long);
    expect(out.startsWith("a".repeat(PAGE_CHAR_BUDGET))).toBe(true);
    expect(out).toContain(`Truncated at ${PAGE_CHAR_BUDGET} characters`);
    expect(out).toContain("500 more not shown");
  });
});
