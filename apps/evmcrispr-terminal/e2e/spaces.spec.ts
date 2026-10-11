import { expect, type Page, test } from "@playwright/test";

const desktop = { width: 1440, height: 900 };
const lines = (page: Page) => page.locator(".monaco-editor .view-lines");

/** The Monaco surface: type through the keyboard, read through the DOM. */
async function typeAtEnd(page: Page, text: string) {
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

/** The id of the space on screen, from the address. */
const spaceId = (page: Page) => page.url().split("#/")[1].split("?")[0];

/** What storage holds for a space: its index record and its private marks. */
function stored(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      new Promise<{ title?: string; approvedText?: string }>((resolve) => {
        const open = indexedDB.open("evmcrispr");
        open.onsuccess = () => {
          const tx = open.result.transaction(["spaces", "markers"]);
          const space = tx.objectStore("spaces").get(id);
          const markers = tx.objectStore("markers").get(id);
          tx.oncomplete = () =>
            resolve({
              title: space.result?.title,
              approvedText: markers.result?.approvedText,
            });
        };
      }),
    id,
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(desktop);
});

test("typed text survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await typeAtEnd(page, "\nprint survives");
  await expect(lines(page)).toContainText("print survives");
  // Storage is written as the person types, but not within the keystroke:
  // wait until the browser has it, as anyone reloading by hand would have.
  const id = spaceId(page);
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print survives");
  await page.reload();
  await expect(lines(page)).toContainText("print survives");
});

test("the first comment is the title, in the editor, the tab and the list", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator(".monaco-editor .evml-title-line").first(),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor .evml-title-hash")).toHaveText(/#/);
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("End");
  await page.keyboard.type(" treasury");
  await expect(page).toHaveTitle("Untitled treasury - EVMcrispr Terminal");
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(
    page.getByRole("heading", { name: "Untitled treasury" }),
  ).toBeVisible();
});

test("what the person types stays reviewed, also after undo and redo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await typeAtEnd(page, "\nprint typed");
  await expect(lines(page)).toContainText("print typed");
  const id = spaceId(page);
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print typed");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(lines(page)).not.toContainText("print typed");
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .not.toContain("print typed");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(lines(page)).toContainText("print typed");
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print typed");
});

test("typing in one tab appears in another", async ({ context }) => {
  const one = await context.newPage();
  await one.setViewportSize(desktop);
  await one.goto("/");
  await expect(lines(one)).toContainText("Untitled");
  const two = await context.newPage();
  await two.setViewportSize(desktop);
  await two.goto(one.url());
  await expect(lines(two)).toContainText("Untitled");

  await typeAtEnd(one, "\nprint from-one");
  await expect(lines(two)).toContainText("print from-one");
  await typeAtEnd(two, "\nprint from-two");
  await expect(lines(one)).toContainText("print from-two");
  // The second tab did not work the approved text out: it re-read it.
  const id = spaceId(one);
  await expect
    .poll(async () => (await stored(one, id)).approvedText)
    .toContain("print from-two");
});

test("scripts stored before spaces are listed after the update", async ({
  page,
}) => {
  const id = "5b0c1e0e-1111-4111-8111-111111111111";
  await page.addInitScript((id) => {
    if (localStorage.getItem("evmcrispr:scripts")) return;
    localStorage.setItem("evmcrispr:migrated", "1");
    localStorage.setItem(
      "evmcrispr:scripts",
      JSON.stringify({
        [id]: {
          id,
          title: "Pay the team",
          script: "print 1",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-03-04T00:00:00.000Z",
        },
      }),
    );
  }, id);
  await page.goto(`/#/${id}`);
  await expect(lines(page)).toContainText("# Pay the team");
  await expect(lines(page)).toContainText("print 1");
  await page.getByRole("tab", { name: "Library" }).click();
  await expect(
    page.getByRole("heading", { name: "Pay the team" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("evmcrispr:scripts")),
  ).toContain("Pay the team");
  expect((await stored(page, id)).approvedText).toBe("# Pay the team\nprint 1");
});

test("view mode shows the title as a heading too", async ({ page }) => {
  await page.goto("/#/?mode=view");
  await expect(
    page.locator(".evml-viewer .line.evml-title-line"),
  ).toContainText("Untitled");
  await expect(page.locator(".evml-viewer .evml-title-hash")).toHaveText(/#/);
});

test("running a script still prints to the console", async ({ page }) => {
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await typeAtEnd(page, "\nprint 42");
  await page.getByRole("button", { name: /execute/i }).click();
  await expect(page.getByText("42", { exact: true })).toBeVisible();
});

test("a browser that refuses storage still works and says nothing will be saved", async ({
  page,
}) => {
  // What a private window or a blocked frame does.
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("status").first()).toContainText(
    "Nothing will be saved",
  );
  await typeAtEnd(page, "\nprint kept in memory");
  await expect(lines(page)).toContainText("print kept in memory");
});
