import { beforeEach, expect, test } from "bun:test";
import { applyText, head } from "@evmcrispr/space";
import { act, fireEvent, screen } from "@testing-library/react";
import { setUi } from "../../src/app/ui-store";
import {
  RevisionPreview,
  usePreviewedRevision,
} from "../../src/editor/RevisionPreview";
import { ORIGIN } from "../../src/space/undo";
import { testBrowser } from "../helpers/app";
import { renderInSpace } from "../setup/test-utils";

function Area() {
  const previewed = usePreviewedRevision();
  return previewed ? <RevisionPreview revision={previewed} /> : <p>current</p>;
}

beforeEach(() => setUi({ previewRevisionId: null }));

test("View shows the revision and leaves the script alone; Load in editor loads it; Back returns", async () => {
  const app = testBrowser().tab();
  const id = await app.spaces.create({ text: "# Pay\nexec 1", source: "user" });
  const space = (await app.spaces.acquire(id))!;
  const first = head(space.timeline.getState())!;
  applyText(space.text, "# Pay\nexec 2", ORIGIN.user);
  renderInSpace(<Area />, { app, space });
  expect(screen.getByText("current")).toBeTruthy();

  act(() => setUi({ previewRevisionId: first.id }));
  expect(screen.getByRole("status").textContent).toContain(
    "Viewing a revision from",
  );
  // No Shiki highlighter in happy-dom: the viewer falls back to plain text.
  expect(screen.getByText(/exec 1/)).toBeTruthy();
  expect(space.getText()).toBe("# Pay\nexec 2");

  fireEvent.click(screen.getByRole("button", { name: "Back to current" }));
  expect(screen.getByText("current")).toBeTruthy();
  expect(space.getText()).toBe("# Pay\nexec 2");

  act(() => setUi({ previewRevisionId: first.id }));
  act(() =>
    fireEvent.click(screen.getByRole("button", { name: "Load in editor" })),
  );
  expect(space.getText()).toBe("# Pay\nexec 1");
  expect(screen.getByText("current")).toBeTruthy();
});

test("a revision of another space is not shown here", async () => {
  const app = testBrowser().tab();
  const a = await app.spaces.create({ text: "a", source: "user" });
  const b = await app.spaces.create({ text: "b", source: "user" });
  const other = head((await app.spaces.acquire(a))!.timeline.getState())!;
  const space = (await app.spaces.acquire(b))!;
  setUi({ previewRevisionId: other.id });
  renderInSpace(<Area />, { app, space });
  expect(screen.getByText("current")).toBeTruthy();
});
