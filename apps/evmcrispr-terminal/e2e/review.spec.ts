import { expect, type Page, test } from "@playwright/test";
import { mockNexus } from "./helpers/nexus";

const desktop = { width: 1440, height: 900 };
const lines = (page: Page) => page.locator(".monaco-editor .view-lines");
const marks = (page: Page) => page.locator(".monaco-editor .evml-changed-line");
const composer = (page: Page) => page.getByPlaceholder(/Ask about the script/);
const execute = (page: Page) =>
  page.getByRole("button", { name: "Execute", exact: true });
const reviewChanges = (page: Page) =>
  page.getByRole("button", { name: "Review changes" });
const dialog = (page: Page) => page.getByRole("dialog");
const approve = (page: Page) =>
  page.getByRole("button", { name: "Approve", exact: true });

async function setScript(page: Page, script: string) {
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(script);
}

async function say(page: Page, text: string) {
  await page.getByRole("tab", { name: "Agents" }).click();
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

const edit = (from: string, to: string, explanation: string) => ({
  tool: "edit_script",
  input: { old_string: from, new_string: to, explanation },
});

/** The runs recorded for the space on screen, by mode. */
function runs(page: Page) {
  return page.evaluate(
    (id) =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("evmcrispr");
        open.onsuccess = () => {
          const all = open.result
            .transaction("runs")
            .objectStore("runs")
            .getAll();
          all.onsuccess = () =>
            resolve(
              (all.result as { spaceId?: string; mode: string }[])
                .filter((run) => !run.spaceId || run.spaceId === id)
                .map((run) => run.mode),
            );
        };
      }),
    page.url().split("#/")[1].split("?")[0],
  );
}

test("an assistant edit asks for a review before Execute; approving restores it; an edit landing while the review is open is not approved; approving shows in another page", async ({
  context,
}) => {
  const nexus = await mockNexus(context);
  const page = await context.newPage();
  await page.setViewportSize(desktop);
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await setScript(page, "# Pay the team\nprint one\nprint two");
  await expect(execute(page)).toBeVisible();
  await expect(marks(page)).toHaveCount(0);

  nexus.answers.push(edit("print two", "print dos", "Said two in Spanish."), {
    text: "Translated.",
  });
  await say(page, "translate the second print");
  await expect(page.getByText("Translated.")).toBeVisible();
  await expect(lines(page)).toContainText("print dos");

  // Execute is gone, the changed line is marked, and nothing real ran.
  await expect(reviewChanges(page)).toBeVisible();
  await expect(execute(page)).toHaveCount(0);
  await expect(marks(page)).toHaveCount(1);

  await reviewChanges(page).click();
  const changes = dialog(page).getByRole("group", { name: "Changes" });
  await expect(changes).toContainText("print two");
  await expect(changes).toContainText("print dos");
  await expect(
    dialog(page).getByRole("list", { name: "Recorded changes" }),
  ).toContainText("Assistant Said two in Spanish.");
  // Looking at the change ran nothing. What the script would do is asked
  // for: a simulated run, recorded like any other.
  expect(await runs(page)).toEqual([]);
  await page
    .getByRole("button", { name: "Simulate to see what it would send" })
    .click();
  await expect(
    dialog(page).getByRole("region", { name: "What the script would do" }),
  ).toContainText("Simulation passed");
  expect(await runs(page)).toEqual(["simulated"]);

  await approve(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(execute(page)).toBeVisible();
  await expect(marks(page)).toHaveCount(0);

  // A further edit by the assistant brings the review back.
  nexus.answers.push(edit("print one", "print uno", "Said one in Spanish."), {
    text: "Translated again.",
  });
  await say(page, "and the first");
  await expect(page.getByText("Translated again.")).toBeVisible();
  await expect(reviewChanges(page)).toBeVisible();
  await expect(execute(page)).toHaveCount(0);

  // The same space in another page: unreviewed there too.
  const other = await context.newPage();
  await other.setViewportSize(desktop);
  await other.goto(page.url());
  await expect(lines(other)).toContainText("print uno");
  await expect(reviewChanges(other)).toBeVisible();

  // While the first page has the review open, the script changes from
  // the other page: what was on display is no longer the script.
  await reviewChanges(page).click();
  await expect(approve(page)).toBeVisible();
  await lines(other).first().click();
  await other.keyboard.press("ControlOrMeta+End");
  await other.keyboard.insertText("\nprint late");
  await expect(dialog(page).getByRole("alert")).toContainText(
    "The script changed since this review was opened",
  );
  // The review stays on what the user was reading, and cannot be approved.
  await expect(approve(page)).toBeDisabled();
  const reading = dialog(page).getByRole("group", { name: "Changes" });
  await expect(reading).toContainText("print uno");
  await expect(reading).not.toContainText("print late");
  await expect(reviewChanges(other)).toBeVisible();

  await page.getByRole("button", { name: "Show the new changes" }).click();
  await expect(reading).toContainText("print late");
  await expect(approve(page)).toBeEnabled();
  await approve(page).click();
  await expect(execute(page)).toBeVisible();
  // Approved for the person, in every page of theirs.
  await expect(execute(other)).toBeVisible();
  await expect(marks(other)).toHaveCount(0);
});

test("Revert takes one change out and keeps later typing; Ctrl+Z brings it back unreviewed; an overlapping Revert is refused and offers Restore", async ({
  context,
}) => {
  const nexus = await mockNexus(context);
  const page = await context.newPage();
  await page.setViewportSize(desktop);
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await setScript(page, "# Counting\nprint one\nprint two\nprint three");

  nexus.answers.push(edit("print one", "print uno", "Said one in Spanish."), {
    text: "Translated.",
  });
  await say(page, "translate the first print");
  await expect(page.getByText("Translated.")).toBeVisible();
  // Typed after the assistant's change.
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nprint four");

  await page.getByRole("tab", { name: "Space" }).click();
  await page
    .getByRole("button", { name: /Assistant Said one in Spanish\./ })
    .click();
  await page.getByRole("button", { name: "Revert this change" }).click();
  await expect(lines(page)).toContainText("print one");
  await expect(lines(page)).toContainText("print four");
  await expect(lines(page)).not.toContainText("print uno");
  await expect(page.getByRole("list", { name: "Timeline" })).toContainText(
    "reverted a change",
  );

  // Ctrl+Z undoes the revert: the assistant's line is back, unreviewed.
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(lines(page)).toContainText("print uno");
  await expect(lines(page)).toContainText("print four");
  await expect(reviewChanges(page)).toBeVisible();
  await expect(execute(page)).toHaveCount(0);

  // The user rewrites the very line the assistant changed.
  await setScript(
    page,
    "# Counting\nprint eins\nprint two\nprint three\nprint four",
  );
  await page.getByRole("button", { name: "Revert this change" }).click();
  await expect(
    page.getByText("Later edits touch the same lines"),
  ).toBeVisible();
  await expect(lines(page)).toContainText("print eins");
  await page.getByRole("button", { name: "Restore to before" }).click();
  await expect(lines(page)).toContainText("print one");
  await expect(lines(page)).not.toContainText("print four");
  // Back on the text that was approved: nothing to review.
  await expect(execute(page)).toBeVisible();
});

test("on mobile the sheet shows what changed above the transactions; no run can be confirmed until it is approved, and a simulation can", async ({
  context,
}) => {
  const nexus = await mockNexus(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  nexus.answers.push(
    {
      tool: "write_script",
      input: { content: "# Mobile\nprint hola", explanation: "Wrote it." },
    },
    { text: "Written." },
  );
  const mobileComposer = page.getByPlaceholder("Describe what to do…");
  await mobileComposer.fill("write a script");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Written.")).toBeVisible();

  await page.getByRole("button", { name: "Open transaction review" }).click();
  const sheet = page.getByRole("dialog");
  const changed = sheet.getByRole("region", { name: "What changed" });
  await expect(changed).toContainText("print hola");
  await expect(changed).toContainText("Assistant Wrote it.");
  // Opening the sheet on an unreviewed script ran nothing. Simulating is
  // one tap away, and not blocked.
  expect(await runs(page)).toEqual([]);
  await sheet.getByRole("button", { name: "Check & simulate" }).click();
  await expect(sheet).toContainText("Simulation passed");
  expect(await runs(page)).toEqual(["simulated"]);
  // Nothing on the sheet leads to the wallet or to a run.
  await expect(sheet.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
  await expect(
    sheet.getByRole("button", { name: /Connect wallet to continue/ }),
  ).toHaveCount(0);
  await expect(
    sheet.getByRole("button", { name: "Run script without simulation" }),
  ).toHaveCount(0);

  await sheet.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(changed).toHaveCount(0);
  await expect(
    sheet.getByRole("button", { name: "Run script without simulation" }),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: "Run script without simulation" })
    .click();
  await expect.poll(() => runs(page)).toContain("real");
});
