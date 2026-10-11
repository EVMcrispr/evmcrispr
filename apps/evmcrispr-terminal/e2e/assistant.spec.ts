import { expect, type Page, test } from "@playwright/test";
import { mockNexus, storedChats } from "./helpers/nexus";

const desktop = { width: 1440, height: 900 };
const lines = (page: Page) => page.locator(".monaco-editor .view-lines");
const spaceId = (page: Page) => page.url().split("#/")[1].split("?")[0];
const composer = (page: Page) => page.getByPlaceholder(/Ask about the script/);
const agents = (page: Page) => page.getByRole("tab", { name: "Agents" });

async function setScript(page: Page, script: string) {
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(script);
}

async function say(page: Page, text: string) {
  await agents(page).click();
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

/** Whether the list of spaces marks `id` as unreviewed. */
function unreviewed(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      new Promise<boolean | undefined>((resolve) => {
        const open = indexedDB.open("evmcrispr");
        open.onsuccess = () => {
          const get = open.result
            .transaction("spaces")
            .objectStore("spaces")
            .get(id);
          get.onsuccess = () => resolve(get.result?.unreviewed);
        };
      }),
    id,
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(desktop);
});

test("ask for a change: one revision with the assistant's explanation in the timeline; Ctrl+Z takes the turn back in one step", async ({
  page,
  context,
}) => {
  const nexus = await mockNexus(context);
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await setScript(page, "# Pay the team\nprint one\nprint two");
  await expect(lines(page)).toContainText("print two");

  nexus.answers.push(
    {
      tool: "edit_script",
      input: {
        old_string: "print one",
        new_string: "print uno",
        explanation: "Said one in Spanish.",
      },
    },
    {
      tool: "edit_script",
      input: {
        old_string: "print two",
        new_string: "print dos",
        explanation: "Said two in Spanish.",
      },
    },
    { text: "Both translated." },
  );
  await say(page, "translate the prints");
  await expect(page.getByText("Both translated.")).toBeVisible();
  await expect(lines(page)).toContainText("print uno");
  await expect(lines(page)).toContainText("print dos");
  // The card says what changed, in the assistant's words.
  await expect(
    page.locator("article").getByText("Said one in Spanish.", { exact: true }),
  ).toBeVisible();
  // The model is sent the conversation, with what it read marked as data.
  expect(nexus.requests.at(-1)).toContain("untrusted content");

  // The card leads to the timeline, where the turn is one revision.
  await page.getByRole("button", { name: "See in timeline" }).first().click();
  const row = page.getByRole("button", {
    name: /Assistant Said one in Spanish\. Said two in Spanish\./,
  });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("unreviewed");
  const id = spaceId(page);
  await expect.poll(() => unreviewed(page, id)).toBe(true);

  // One Ctrl+Z for the whole turn, and the script is the user's again.
  await lines(page).first().click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(lines(page)).toContainText("print one");
  await expect(lines(page)).toContainText("print two");
  await expect(lines(page)).not.toContainText("print uno");
  await expect.poll(() => unreviewed(page, id)).toBe(false);
});

test("the chat survives a reload: the page opens on an empty one and the history reopens it; it stays open in another space and is labelled with where it started", async ({
  page,
  context,
}) => {
  const nexus = await mockNexus(context);
  await page.goto("/");
  await setScript(page, "# First space\nprint 1");
  nexus.answers.push({ text: "Hello from the model." });
  await say(page, "hello there");
  await expect(page.getByText("Hello from the model.")).toBeVisible();
  const first = spaceId(page);
  await expect.poll(async () => (await storedChats(page))[0]?.items).toBe(2);
  expect((await storedChats(page))[0].label).toBe(first);

  await page.reload();
  await agents(page).click();
  // The page opens on an empty chat; the earlier one is in the history.
  await expect(composer(page)).toBeVisible();
  await expect(page.getByText("Hello from the model.")).toHaveCount(0);
  await page.getByRole("button", { name: "Chat history" }).click();
  await page.getByRole("button", { name: /hello there/ }).click();
  await expect(page.getByText("hello there").first()).toBeVisible();
  await expect(page.getByText("Hello from the model.")).toBeVisible();

  // Another space: the same chat, still open.
  // A new space is made from the list of spaces.
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Back to Spaces" }).click();
  await page.getByRole("button", { name: "New space", exact: true }).click();
  await expect(lines(page)).toContainText("Example");
  expect(spaceId(page)).not.toBe(first);
  await agents(page).click();
  await expect(page.getByText("Hello from the model.")).toBeVisible();

  // "Now do the same here": the turn works on the space on screen.
  nexus.answers.push(
    {
      tool: "write_script",
      input: { content: "# Second space\nprint 2", explanation: "Same here." },
    },
    { text: "Done here too." },
  );
  await composer(page).fill("the same here");
  await composer(page).press("Enter");
  await expect(page.getByText("Done here too.")).toBeVisible();
  await expect(lines(page)).toContainText("Second space");
  expect((await storedChats(page)).length).toBe(1);

  await page.getByRole("button", { name: "Chat history" }).click();
  await expect(page.getByText(/started in First space/)).toBeVisible();
});

test("old chats are in the Agents tab after the update, and old storage is left as it was", async ({
  page,
  context,
}) => {
  await mockNexus(context);
  const SCRIPT = "00000000-0000-4000-8000-00000000000a";
  await page.addInitScript((script) => {
    if (localStorage.getItem("evmcrispr:chats")) return;
    const now = new Date().toISOString();
    localStorage.setItem(
      "evmcrispr:scripts",
      JSON.stringify({
        [script]: {
          id: script,
          title: "Old script",
          script: "print old",
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    const chats = [
      { id: "chat-a", title: "About the old script", scopeId: script },
      { id: "chat-x", title: "From before chats had scripts" },
    ].map((chat) => ({ ...chat, createdAt: now, updatedAt: now }));
    localStorage.setItem("evmcrispr:chats", JSON.stringify(chats));
    for (const chat of chats)
      localStorage.setItem(
        `evmcrispr:chat:${chat.id}`,
        JSON.stringify({
          id: chat.id,
          items: [{ role: "user", text: `said in ${chat.id}` }],
          messages: [{ role: "user", content: `said in ${chat.id}` }],
        }),
      );
  }, SCRIPT);
  await page.goto("/");
  await agents(page).click();
  // The page opens on an empty chat; the old ones are in the history.
  await expect(composer(page)).toBeVisible();
  await expect(page.getByText(/^said in chat-/)).toHaveCount(0);

  await page.getByRole("button", { name: "Chat history" }).click();
  await expect(page.getByText("About the old script")).toBeVisible();
  await expect(page.getByText("From before chats had scripts")).toBeVisible();
  await expect(page.getByText(/started in Old script/)).toHaveCount(1);

  const old = await page.evaluate(() => ({
    index: JSON.parse(localStorage.getItem("evmcrispr:chats") ?? "[]").length,
    chat: localStorage.getItem("evmcrispr:chat:chat-a"),
    flag: localStorage.getItem("evmcrispr:migrated:chats"),
  }));
  expect(old.index).toBe(2);
  expect(old.chat).toContain("said in chat-a");
  expect(old.flag).toBe("1");
});

test("an edit to a space that is not on screen waits for the user's word, then marks that space unreviewed in the list", async ({
  page,
  context,
}) => {
  const nexus = await mockNexus(context);
  await page.goto("/");
  await setScript(page, "# Treasury swap\nprint 1");
  await expect(lines(page)).toContainText("Treasury swap");
  const other = spaceId(page);
  // A new space is made from the list of spaces.
  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Back to Spaces" }).click();
  await page.getByRole("button", { name: "New space", exact: true }).click();
  await expect(lines(page)).toContainText("Example");
  const here = spaceId(page);

  const edit = {
    tool: "write_script",
    input: {
      content: "# Treasury swap\nprint 666",
      explanation: "Changed the swap.",
      space: other,
    },
  };
  nexus.answers.push(edit, { text: "I need your permission for that." });
  await say(page, "change the treasury swap");
  await expect(
    page.getByText(
      "Let the assistant edit “Treasury swap”? You are not looking at it.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("I need your permission for that."),
  ).toBeVisible();
  expect(await unreviewed(page, other)).toBe(false);

  await page.getByRole("button", { name: "Allow for this chat" }).click();
  nexus.answers.push(edit, { text: "Changed." });
  await composer(page).fill("go on");
  await composer(page).press("Enter");
  await expect(page.getByText("Changed.", { exact: true })).toBeVisible();
  await expect.poll(() => unreviewed(page, other)).toBe(true);
  expect(spaceId(page)).toBe(here);
  expect(await unreviewed(page, here)).toBe(false);

  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Spaces" }).click();
  const row = page
    .getByRole("list", { name: "Spaces" })
    .getByRole("button", { name: /^Treasury swap/ });
  await expect(row).toContainText("unreviewed");
  await row.click();
  await expect(lines(page)).toContainText("print 666");
});

test("the same chat in two pages answers one turn at a time", async ({
  context,
}) => {
  const nexus = await mockNexus(context);
  const one = await context.newPage();
  await one.setViewportSize(desktop);
  await one.goto("/");
  nexus.answers.push({ text: "First answer." });
  await say(one, "first question");
  await expect(one.getByText("First answer.")).toBeVisible();
  await expect.poll(async () => (await storedChats(one))[0]?.items).toBe(2);

  const two = await context.newPage();
  await two.setViewportSize(desktop);
  await two.goto(one.url());
  await agents(two).click();
  // A page opens on an empty chat: the second one opens the same chat.
  await two.getByRole("button", { name: "Chat history" }).click();
  await two.getByRole("button", { name: /first question/ }).click();
  await expect(two.getByText("First answer.")).toBeVisible();

  // The first page asks, and its answer is held back.
  let open!: () => void;
  nexus.gate = new Promise((resolve) => {
    open = resolve;
  });
  nexus.answers.push({ text: "Second answer." });
  await say(one, "second question");
  await expect(two.getByText("Answering in another tab…")).toBeVisible();
  await expect(two.getByText("second question")).toBeVisible();
  await expect(
    two.getByPlaceholder("Answering in another tab…"),
  ).toBeDisabled();
  const sent = nexus.requests.length;

  open();
  nexus.gate = null;
  await expect(one.getByText("Second answer.")).toBeVisible();
  await expect(two.getByText("Second answer.")).toBeVisible();
  await expect(two.getByText("Answering in another tab…")).toHaveCount(0);
  await expect(composer(two)).toBeEnabled();
  expect(nexus.requests.length).toBe(sent);

  // And the second page carries on from there.
  nexus.answers.push({ text: "Third answer." });
  await composer(two).fill("third question");
  await composer(two).press("Enter");
  await expect(two.getByText("Third answer.")).toBeVisible();
  await expect(one.getByText("Third answer.")).toBeVisible();
  expect((await storedChats(two)).length).toBe(1);
});

test("without a Nexus key the Space tab works in full and the Agents tab shows the sign-in screen", async ({
  page,
}) => {
  await page.goto("/");
  await expect(lines(page)).toContainText("Untitled");
  await agents(page).click();
  await expect(
    page.getByRole("button", { name: "Login with Dappnode Nexus" }),
  ).toBeVisible();
  await expect(composer(page)).toHaveCount(0);

  await page.getByRole("tab", { name: "Spaces" }).click();
  await page.getByRole("button", { name: "Spaces" }).click();
  await expect(page.getByRole("list", { name: "Spaces" })).toBeVisible();
});
