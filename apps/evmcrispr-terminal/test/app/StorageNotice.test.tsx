import { expect, test } from "bun:test";
import { act, screen } from "@testing-library/react";
import { askToPersist } from "../../src/app/boot";
import { StorageNotice } from "../../src/app/StorageNotice";
import { testBrowser } from "../helpers/app";
import { settle } from "../helpers/tabs";
import { renderWithApp } from "../setup/test-utils";

test("says nothing will be saved when storage is in memory", () => {
  // The test browser runs on memory storage, as a refused IndexedDB does.
  renderWithApp(<StorageNotice />, { app: testBrowser().tab() });
  expect(screen.getByRole("status")).toHaveTextContent("Nothing will be saved");
});

test("asks to reload when a newer version took the database", () => {
  const app = { ...testBrowser().tab() };
  app.storage = { ...app.storage, persistent: true };
  renderWithApp(<StorageNotice />, { app });
  expect(screen.queryByRole("status")).toBeNull();
  act(() => app.outdated.setState(true, true));
  expect(screen.getByRole("alert")).toHaveTextContent("Reload");
});

test("asks the browser to keep storage once a space has been written to", async () => {
  const app = testBrowser().tab();
  let asked = 0;
  askToPersist(app.spaces, async () => {
    asked++;
    return true;
  });
  const id = await app.spaces.create({ text: "exec 1", source: "user" });
  await settle();
  expect(asked).toBe(0); // created, not yet written to
  await app.storage.records.patchSpace(id, {
    updatedAt: Number.MAX_SAFE_INTEGER,
  });
  app.changes.announce({ store: "spaces", key: id });
  await settle();
  await app.storage.records.patchSpace(id, { title: "again" });
  app.changes.announce({ store: "spaces", key: id });
  await settle();
  expect(asked).toBe(1);
});
