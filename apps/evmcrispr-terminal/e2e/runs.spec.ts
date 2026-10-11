import { expect, type Page, test } from "@playwright/test";
import { installWallet, wallet } from "./helpers/wallet";

const desktop = { width: 1440, height: 900 };
// The burn address: checksummed, never called (the wallet is a stub).
const TARGET = "0x000000000000000000000000000000000000dEaD";
const TWO_TRANSACTIONS = `# Two steps\nexec ${TARGET} "ping()"\nexec ${TARGET} "pong()"`;

async function setScript(page: Page, script: string) {
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(script);
}

const card = (page: Page) => page.locator('[id^="run-"]').last();
const pinned = (page: Page) =>
  page.getByRole("list", { name: "Unfinished runs" });
const execute = (page: Page) => page.getByRole("button", { name: "Execute" });

/** Opens another space in this tab, and comes back to `id`. */
async function leave(page: Page) {
  // A new space is made from the list of spaces.
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Back to Spaces" }).click();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "Example",
  );
}
async function comeBack(page: Page, title: string) {
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Spaces" }).click();
  await page
    .getByRole("list", { name: "Spaces" })
    .getByRole("button", { name: new RegExp(`^${title}`) })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(desktop);
});

test("a run is a card that survives a reload", async ({ page }) => {
  await page.goto("/");
  await setScript(page, "# Card\nprint hello-from-run");
  await execute(page).click();
  await expect(card(page)).toContainText("hello-from-run");
  await expect(card(page)).toContainText("Done");
  await page.reload();
  await page.getByRole("tab", { name: "Spaces" }).click();
  await expect(card(page)).toContainText("Run");
  await expect(card(page)).toContainText("hello-from-run");
  await card(page).getByRole("button", { name: "View script" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Viewing a revision",
  );
});

test("a second tab shows the run and refuses to start one; closing the first interrupts it", async ({
  context,
}) => {
  await installWallet(context);
  const first = await context.newPage();
  await first.setViewportSize(desktop);
  await first.goto("/");
  await wallet(first).connected();
  await setScript(first, TWO_TRANSACTIONS);
  await execute(first).click();
  await expect.poll(() => wallet(first).waiting()).toBe(1);

  const second = await context.newPage();
  await second.setViewportSize(desktop);
  await second.goto(first.url());
  await expect(pinned(second)).toContainText("in another tab");
  await expect(execute(second)).toBeDisabled();
  await expect(card(second)).toContainText("Waiting for wallet…");

  // The tab running it goes away: the browser releases its locks.
  await first.close();
  await expect(card(second)).toContainText("Interrupted");
  await expect(card(second)).toContainText("Stopped following");
  await expect(execute(second)).toBeEnabled();
});

test("leaving the space holds the next wallet request; declining pauses; Resume asks again; Cancel ends", async ({
  context,
  page,
}) => {
  await installWallet(context);
  await page.goto("/");
  await wallet(page).connected();
  await setScript(page, TWO_TRANSACTIONS);
  await execute(page).click();
  await expect.poll(() => wallet(page).waiting()).toBe(1);
  await expect(card(page)).toContainText("Waiting for wallet…");

  // The prompt of the first step is open; the user goes to another space
  // and confirms it there.
  await leave(page);
  await wallet(page).confirm();
  await comeBack(page, "Two steps");
  await expect(card(page)).toContainText("Paused: you opened another space");
  await expect(card(page)).toContainText("Confirmed in block 16");
  // Before Resume is pressed: what it will send, and to whom.
  const held = card(page).getByRole("group", { name: "Held action" });
  await expect(held).toContainText("Contract call");
  await expect(held).toContainText(TARGET);
  await expect(held).toContainText("Ethereum");
  await expect(held.getByRole("button", { name: "Resume" })).toBeVisible();
  // The second step is held: its box says so, and the wallet saw nothing.
  await expect(
    card(page).getByText("Paused", { exact: true }).first(),
  ).toBeVisible();
  expect(await wallet(page).prompts()).toBe(1);
  // It never resumes by itself.
  await page.waitForTimeout(500);
  expect(await wallet(page).prompts()).toBe(1);
  await expect(pinned(page)).toContainText("Run Paused");

  await card(page).getByRole("button", { name: "Resume" }).click();
  await expect.poll(() => wallet(page).prompts()).toBe(2);
  await expect(card(page)).toContainText("Waiting for wallet…");

  await wallet(page).decline();
  await expect(card(page)).toContainText("Paused: you declined in your wallet");
  await expect(card(page)).toContainText("Declined in wallet");
  await expect(
    page.getByRole("button", { name: "Resume" }).first(),
  ).toBeVisible();

  // Resume shows the same request again.
  await card(page).getByRole("button", { name: "Resume" }).click();
  await expect.poll(() => wallet(page).prompts()).toBe(3);
  await wallet(page).decline();
  await expect(card(page)).toContainText("Paused: you declined in your wallet");

  // Cancel hands the refusal to the script and ends the run.
  await card(page).getByRole("button", { name: "Cancel" }).click();
  await expect(card(page)).toContainText("Cancelled");
  await expect(card(page)).toContainText("Rejected in wallet");
  await expect(pinned(page)).toHaveCount(0);
  await expect(execute(page)).toBeVisible();
  expect(await wallet(page).prompts()).toBe(3);
});

test("the list of spaces marks a space whose run is paused", async ({
  context,
  page,
}) => {
  await installWallet(context);
  await page.goto("/");
  await wallet(page).connected();
  await setScript(page, TWO_TRANSACTIONS);
  await execute(page).click();
  await expect.poll(() => wallet(page).waiting()).toBe(1);
  await wallet(page).decline();
  await expect(card(page)).toContainText("Paused: you declined in your wallet");
  await page.getByRole("button", { name: "Spaces" }).click();
  await expect(page.getByRole("list", { name: "Spaces" })).toContainText(
    "run paused",
  );
});
