import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  Console,
  consoleEntries,
  emptyConsole,
  parseConsole,
  reduceConsole,
} from "@evmcrispr/editor";
import { render } from "@testing-library/react";

const LINES = [
  "a [link](https://evil.test/a) here",
  "![pixel](https://evil.test/pixel.png?who=you)",
  '<img src="https://evil.test/raw.png" onerror="alert(1)"><b>bold</b>',
  "[click](javascript:alert(1)) and [data](data:text/html,x) and [http](http://plain.test/)",
  "<https://evil.test/auto>",
];
const box = {
  id: "b",
  state: "done" as const,
  title: "Sent",
  detail: "see [tx](https://evil.test/tx) ![i](https://evil.test/i.png)",
  history: ["![h](https://evil.test/h.png)"],
  links: {
    tx: "https://scan.test/tx/1",
    js: "javascript:alert(1)",
    plain: "http://plain.test/",
  },
  progress: [1, 1] as [number, number],
  steps: [{ state: "done" as const, href: "javascript:alert(2)" }],
  simulated: false,
};
const made = () => {
  let state = emptyConsole;
  for (const text of LINES)
    state = reduceConsole(state, { kind: "line", text });
  return reduceConsole(state, { kind: "box", snapshot: box });
};

// Rendering must not make the page ask anything of anyone.
const realFetch = globalThis.fetch;
let requests = 0;
beforeEach(() => {
  requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return new Response("");
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const hrefs = (root: HTMLElement) =>
  [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));

test("by default output is the characters it is: no link, no image, no markup", () => {
  const { container } = render(
    <Console
      entries={consoleEntries(made())}
      errors={["<i>e</i> [x](https://e.test)"]}
    />,
  );
  expect(container.querySelectorAll("a, img, b, i")).toHaveLength(0);
  expect(container.textContent).toContain(
    "![pixel](https://evil.test/pixel.png?who=you)",
  );
  expect(container.textContent).toContain("<b>bold</b>");
  expect(requests).toBe(0);
});

test("a console from an export renders none of it, whatever the caller passes", () => {
  const imported = parseConsole(
    JSON.parse(JSON.stringify(made())),
    "Not followed here",
  );
  const { container } = render(
    <Console entries={consoleEntries(imported)} errors={[]} markdown />,
  );
  expect(container.querySelectorAll("a, img, b")).toHaveLength(0);
  expect(container.textContent).toContain("[link](https://evil.test/a)");
  expect(requests).toBe(0);
});

test("a run made here, as markdown: never an image or raw HTML, links only to https and with their address in sight", () => {
  const { container } = render(
    <Console entries={consoleEntries(made())} errors={[]} markdown />,
  );
  expect(container.querySelectorAll("img")).toHaveLength(0);
  expect(container.querySelector("[onerror]")).toBeNull();
  expect(container.querySelectorAll("b")).toHaveLength(0);
  const links = hrefs(container);
  expect(links.sort()).toEqual(
    [
      "https://evil.test/a",
      "https://evil.test/auto",
      "https://evil.test/tx",
      "https://scan.test/tx/1",
    ].sort(),
  );
  for (const a of container.querySelectorAll("a")) {
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  }
  // Where each goes is on screen, not only behind its text.
  expect(container.textContent).toContain("(https://evil.test/a)");
  expect(container.textContent).toContain("scan.test");
  // What is not a link is still there as text.
  expect(container.textContent).toContain("click");
  expect(container.textContent).toContain("pixel");
  expect(requests).toBe(0);
});
