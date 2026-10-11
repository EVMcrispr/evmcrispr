import { type BrowserContext, expect, type Page, test } from "@playwright/test";

const desktop = { width: 1440, height: 900 };
const lines = (page: Page) => page.locator(".monaco-editor .view-lines");
const spaceId = (page: Page) => page.url().split("#/")[1].split("?")[0];

async function typeAtEnd(page: Page, text: string) {
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

/** What storage holds for a space. */
function stored(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      new Promise<{
        approvedText?: string;
        entries: { kind: string; unverified?: boolean }[];
        chats: number;
      }>((resolve) => {
        const open = indexedDB.open("evmcrispr");
        open.onsuccess = () => {
          const tx = open.result.transaction(["markers", "entries", "chats"]);
          const markers = tx.objectStore("markers").get(id);
          const entries = tx
            .objectStore("entries")
            .getAll(IDBKeyRange.bound([id], [id, []]));
          const chats = tx.objectStore("chats").count();
          tx.oncomplete = () =>
            resolve({
              approvedText: markers.result?.approvedText,
              entries: entries.result,
              chats: chats.result,
            });
        };
      }),
    id,
  );
}

// Real CIDs, so the address is taken for a link. What each holds is
// whatever was pinned under it: Pinata and the gateway are both played
// here, and neither is ever called.
const CIDS = [
  "QmZYrSACX7w6DbPg2SRJ4JrKkZpHbg86mqQ27xvChTCRry",
  "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
  "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
  "QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB",
];
function ipfs() {
  const pins = new Map<string, string>();
  const requests: string[] = [];
  const serve = async (context: BrowserContext) => {
    await context.addInitScript(() => {
      Object.assign(window, {
        process: { env: { EVMCRISPR_TRUST_IPFS_GATEWAY: "true" } },
      });
    });
    await context.route("https://api.pinata.cloud/**", async (route) => {
      const cid = CIDS[pins.size];
      pins.set(
        cid,
        JSON.stringify(route.request().postDataJSON().pinataContent),
      );
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ IpfsHash: cid }),
      });
    });
    await context.route("https://ipfs.blossom.software/**", async (route) => {
      const cid = route.request().url().split("/ipfs/")[1].split(/[/?]/)[0];
      requests.push(cid);
      const body = pins.get(cid);
      if (body === undefined) return route.fulfill({ status: 404 });
      await route.fulfill({ contentType: "application/json", body });
    });
  };
  return { pins, requests, serve };
}

const menu = async (page: Page, item: string) => {
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Space menu" }).click();
  await page.getByRole("menuitem", { name: item }).click();
};

/** Exports the space on screen and returns its link. */
async function exportLink(page: Page) {
  await menu(page, "Export space…");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Anyone who gets the link can read all of it, permanently",
  );
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = await dialog
    .getByLabel("Link to the exported space")
    .inputValue();
  await page.keyboard.press("Escape");
  return link;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(desktop);
});

test("export a space, then restore it in a browser that does not have it: the same script and what was recorded, approved, no chats", async ({
  page,
  context,
  browser,
}) => {
  const net = ipfs();
  await net.serve(context);
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await typeAtEnd(page, "\nprint exported");
  const id = spaceId(page);
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print exported");
  const address = page.url();
  const link = await exportLink(page);
  // The address bar was left alone, and the link is of another shape.
  expect(page.url()).toBe(address);
  expect(link).toMatch(/#\/Qm\w+#[\w-]{43}$/);
  const script = (await stored(page, id)).approvedText as string;
  // Nothing readable was pinned.
  expect([...net.pins.values()][0]).not.toContain("print exported");

  const other = await browser.newContext();
  await net.serve(other);
  const there = await other.newPage();
  await there.setViewportSize(desktop);
  await there.goto(link);
  // The link asks; nothing is made until it is answered.
  await expect(there.getByText("This link holds a whole space")).toBeVisible();
  await expect(there.locator(".monaco-editor")).toHaveCount(0);
  await expect(there.getByRole("button", { name: /Merge/ })).toHaveCount(0);
  const fetched = net.requests.length;
  await there.getByRole("button", { name: "Restore" }).click();
  await expect(there).toHaveURL(new RegExp(`#/${id}$`));
  await expect(there.locator(".monaco-editor .view-lines")).toContainText(
    "print exported",
  );
  await expect
    .poll(async () => (await stored(there, id)).approvedText)
    .toBe(script);
  const kept = await stored(there, id);
  expect(kept.chats).toBe(0);
  // What the export recorded is there, marked; one revision is this
  // browser's own.
  expect(kept.entries.filter((e) => e.unverified).length).toBeGreaterThan(0);
  expect(
    kept.entries.filter((e) => e.kind === "revision" && !e.unverified),
  ).toHaveLength(1);
  await there.getByRole("tab", { name: "Spaces" }).click();
  await expect(there.getByText("From an export").first()).toBeVisible();
  // Reviewed: Execute is Execute.
  await expect(
    there.getByRole("button", { name: "Review changes" }),
  ).toHaveCount(0);
  expect(net.requests.length).toBe(fetched);
  await other.close();
});

test("an export link opened where the space is asks first, by name; Merge replaces the script and leaves it to be reviewed", async ({
  page,
  context,
}) => {
  const net = ipfs();
  await net.serve(context);
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await typeAtEnd(page, "\nprint first");
  const id = spaceId(page);
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print first");
  const link = await exportLink(page);
  await typeAtEnd(page, "\nprint second");
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print second");

  await page.goto(link);
  const warning = page
    .getByRole("alert")
    .filter({ hasText: "goes into a space you already have" });
  await expect(warning).toContainText("goes into a space you already have");
  await expect(warning).toContainText("Untitled");
  await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open as copy" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  // Nothing happened by opening it.
  expect((await stored(page, id)).approvedText).toContain("print second");

  await page.getByRole("button", { name: /^Merge into/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/${id}$`));
  await expect(lines(page)).not.toContainText("print second");
  await expect(lines(page)).toContainText("print first");
  await expect(
    page.getByRole("button", { name: "Review changes" }),
  ).toBeVisible();
  // What was approved did not move.
  expect((await stored(page, id)).approvedText).toContain("print second");
  await page.getByRole("tab", { name: "Spaces" }).click();
  await expect(
    page.getByText("replaced the script with the one from a link"),
  ).toBeVisible();
});

test("Open as copy makes another space; a wrong key and a broken export make none", async ({
  page,
  context,
}) => {
  const net = ipfs();
  await net.serve(context);
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await typeAtEnd(page, "\nprint copied");
  const id = spaceId(page);
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print copied");
  const link = await exportLink(page);

  await page.goto(`${link.slice(0, -4)}AAAA`);
  await expect(page.getByText("Key Rejected")).toBeVisible();

  await page.goto(link);
  await page.getByRole("button", { name: "Open as copy" }).click();
  await expect(lines(page)).toContainText("print copied");
  expect(spaceId(page)).not.toBe(id);
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Spaces" }).click();
  await expect(
    page.getByRole("list", { name: "Spaces" }).getByRole("listitem"),
  ).toHaveCount(2);
});

test("share from a revision row: it reads shared, Copy link gives the same link, the address never changes", async ({
  page,
  context,
}) => {
  const net = ipfs();
  await net.serve(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  const address = page.url();
  await page.getByRole("tab", { name: "Spaces" }).click();
  // A script is shared from the header; its row then hands the link back.
  await page.getByRole("button", { name: "Share script" }).click();
  await expect(page.getByText("shared", { exact: true })).toBeVisible();
  await page.getByText("created the script").click();
  const first = await page.evaluate(() => navigator.clipboard.readText());
  expect(first).toMatch(/#\/Qm\w+#[\w-]{43}$/);
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Copy link" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(first);
  expect(net.pins.size).toBe(1);
  expect(page.url()).toBe(address);
});

test("Clear for me and Show earlier; Clear timeline leaves one revision and a note; removing a space asks first", async ({
  page,
}) => {
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await typeAtEnd(page, "\nprint kept");
  const id = spaceId(page);
  await expect
    .poll(async () => (await stored(page, id)).approvedText)
    .toContain("print kept");

  await menu(page, "Clear for me");
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
  await page.getByRole("button", { name: /Show earlier/ }).click();
  await expect(page.getByText("created the script")).toBeVisible();

  await menu(page, "Clear timeline…");
  // By name: the toast of "Clear for me" is still up, and a toast is a
  // (non-modal) dialog too.
  const question = page.getByRole("dialog", { name: "Clear timeline" });
  await expect(question).toContainText(
    "Exports and share links made earlier still contain what they contained",
  );
  await question.getByRole("button", { name: "Clear timeline" }).click();
  await expect(page.getByText(/You cleared the timeline/)).toBeVisible();
  await expect
    .poll(async () =>
      (await stored(page, id)).entries.map((e) => e.kind).sort(),
    )
    .toEqual(["cleared", "revision"]);
  await expect(lines(page)).toContainText("print kept");
  expect((await stored(page, id)).approvedText).toContain("print kept");

  await page.getByRole("button", { name: "Spaces" }).click();
  await page.getByRole("button", { name: /^Remove / }).click();
  const sure = page.getByRole("dialog", { name: "Remove this space" });
  await expect(sure).toContainText("from this browser, for good");
  await sure.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("list", { name: "Spaces" }).getByRole("listitem"),
  ).toHaveCount(1);
});

/** The editor's own undo, as its context menu and the browser's Edit menu
 *  run it: not Ctrl+Z, which is the space's. */
const native = (page: Page, command: "undo" | "redo") =>
  page.evaluate((command) => {
    const { monaco } = window as unknown as {
      monaco: {
        editor: { getEditors(): { trigger(...a: unknown[]): void }[] };
      };
    };
    for (const editor of monaco.editor.getEditors())
      editor.trigger("test", command, null);
  }, command);
const nativeUndo = (page: Page) => native(page, "undo");

test("after Clear timeline no undo brings deleted text back: not Ctrl+Z, not the editor's own, here or in another tab", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  const other = await context.newPage();
  await other.setViewportSize(desktop);
  await other.goto(page.url());
  await expect(lines(other)).toContainText("Untitled");

  // Each tab types something and deletes it again.
  for (const [tab, word] of [
    [page, "SECRETONE"],
    [other, "SECRETTWO"],
  ] as const) {
    await tab.bringToFront();
    await typeAtEnd(tab, word);
    await expect(lines(tab)).toContainText(word);
    for (let i = 0; i < word.length; i++) await tab.keyboard.press("Backspace");
    await expect(lines(tab)).not.toContainText(word);
  }
  // The editor's own undo does bring it back, before the clearing.
  await nativeUndo(other);
  await expect(lines(other)).toContainText("SECRETTWO");
  // ...and its redo takes it away again, leaving that history in place.
  await native(other, "redo");
  await expect(lines(other)).not.toContainText("SECRETTWO");

  await page.bringToFront();
  await menu(page, "Clear timeline…");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clear timeline" })
    .click();
  await expect(page.getByText(/You cleared the timeline/)).toBeVisible();

  for (const tab of [page, other]) {
    await tab.bringToFront();
    const before = await lines(tab).innerText();
    // Step by step: no undo, of either kind, shows it even for a moment.
    const steps = [
      ...Array.from({ length: 5 }, () => () => nativeUndo(tab)),
      () => lines(tab).first().click(),
      ...Array.from(
        { length: 5 },
        () => () => tab.keyboard.press("ControlOrMeta+z"),
      ),
    ];
    for (const step of steps) {
      await step();
      await tab.waitForTimeout(100);
      expect(await lines(tab).innerText()).not.toContain("SECRET");
    }
    await expect(lines(tab)).not.toContainText("SECRET");
    expect(await lines(tab).innerText()).toBe(before);
  }
});
