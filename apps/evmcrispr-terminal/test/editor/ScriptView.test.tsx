import { expect, test } from "bun:test";
import { applyText } from "@evmcrispr/space";
import { act, screen } from "@testing-library/react";
import { ScriptView } from "../../src/editor/ScriptView";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { renderInSpace } from "../setup/test-utils";

test("shows the space's script and follows edits made anywhere", async () => {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text: "# Pay\nexec 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  renderInSpace(<ScriptView />, { app, space });
  // No Shiki highlighter in happy-dom: the viewer falls back to plain text.
  expect(screen.getByText(/exec 1/)).toBeInTheDocument();

  // The assistant, another tab, a load: all of them only write the document.
  act(() => {
    applyText(space.text, "# Pay\nexec 2", ORIGIN.assistant);
  });
  expect(screen.getByText(/exec 2/)).toBeInTheDocument();
});

test("while unreviewed, the lines that differ from the approved text are the marked ones", async () => {
  const { useChangedLines } = await import("../../src/app/SpaceContext");
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text: "a\nb\nc", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  const Lines = () => (
    <output data-testid="lines">{useChangedLines().join(",")}</output>
  );
  renderInSpace(<Lines />, { app, space });
  const lines = () => screen.getByTestId("lines").textContent;
  expect(lines()).toBe("");
  // The user's own typing is never marked.
  act(() => void applyText(space.text, "a\nb\nc\nd", ORIGIN.user));
  expect(lines()).toBe("");
  act(() => {
    space.editAsTurn("t", { kind: "write", text: "a\nB\nc\nd\ne" });
    space.endTurn("t");
  });
  expect(lines()).toBe("2,5");
  // Typing on top is marked too: the mark says "differs", not who.
  act(() => void applyText(space.text, "A\nB\nc\nd\ne", ORIGIN.user));
  expect(lines()).toBe("1,2,5");
  act(() => void space.approve(space.getText()));
  expect(lines()).toBe("");

  // Nothing approved: every line differs.
  const made = await app.spaces.create({
    text: "x\ny",
    source: "import",
    unreviewed: true,
  });
  const fresh = (await app.spaces.acquire(made))!;
  renderInSpace(<Lines />, { app, space: fresh });
  expect(screen.getAllByTestId("lines")[1].textContent).toBe("1,2");
});

test("showing an unreviewed script fetches no module it names; once approved it is fetched", async () => {
  const CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
  const real = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input instanceof Request ? input.url : input));
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const asked = () => requests.some((url) => url.includes(CID));
  const analysed = () => new Promise((resolve) => setTimeout(resolve, 600));
  try {
    const app = testBrowser().tab();
    const id = await app.spaces.create({ text: "print 1", source: "user" });
    const space = (await app.spaces.acquire(id))!;
    renderInSpace(<ScriptView />, { app, space });
    act(() => {
      space.editAsTurn("t", {
        kind: "write",
        text: `load lib --from "ipfs://${CID}"\nlib:pay 1`,
      });
      space.endTurn("t");
    });
    await act(analysed);
    expect(asked()).toBe(false);
    // The script goes back to the approved text while the view still
    // holds the unreviewed one for a moment (its analysis is debounced):
    // the permission is asked of each text analysed, so the unreviewed
    // text is not fetched for under the approved text's answer.
    act(() => void space.load("print 1", "load"));
    await act(analysed);
    expect(asked()).toBe(false);
    act(() => void space.undo.undo());
    await act(analysed);
    expect(asked()).toBe(false);
    // Approved, the same text is fetched for at its next analysis.
    act(() => void space.approve(space.getText()));
    act(() => void applyText(space.text, `${space.getText()}\n`, ORIGIN.user));
    await act(analysed);
    expect(asked()).toBe(true);
  } finally {
    globalThis.fetch = real;
  }
});
