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
