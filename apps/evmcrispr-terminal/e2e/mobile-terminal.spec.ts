import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const CID = "QmZYrSACX7w6DbPg2SRJ4JrKkZpHbg86mqQ27xvChTCRry";

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`chat-first shell at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
    });
    await page.goto("/");

    await expect(page.getByPlaceholder("Describe what to do…")).toBeVisible();
    await expect(page.locator(".monaco-editor")).toHaveCount(0);

    // The script identity stays on screen while chatting — context card,
    // not a tray destination.
    await expect(page.getByText("Untitled", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Script", exact: true }),
    ).toHaveCount(0);

    // Chat switching lives behind one composer button, not a third
    // chrome bar.
    await expect(
      page.getByRole("button", { name: "Previous chats" }),
    ).toBeVisible();
    await expect(page.getByText("DappNode Nexus")).toHaveCount(0);

    await openScript(page);
    await expect(
      page.getByRole("region", { name: "Script review" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review & execute" }),
    ).toBeVisible();
    await expect(page.locator(".monaco-editor")).toHaveCount(0);
  });
}

/** From the chat to the script: the space's name opens its timeline, and
 *  the timeline leads to the script. */
async function openScript(page: Page) {
  await page.getByRole("button", { name: "Open space" }).click();
  // The space, at the top of its timeline: its name and when it changed.
  await page.getByRole("button", { name: /Updated/ }).click();
}

test("received CID links land on the read-only script", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.assign(window, {
      process: { env: { EVMCRISPR_TRUST_IPFS_GATEWAY: "true" } },
    });
  });
  await page.route("https://ipfs.blossom.software/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        title: "Treasury rebalance",
        script: "switch mainnet\nprint 1",
      }),
    });
  });

  await page.goto(`/#/${CID}`);

  // The share's title arrives as the script's first comment.
  await expect(
    page.getByRole("heading", { name: "Treasury rebalance" }),
  ).toBeVisible();
  await expect(page.locator(".evml-viewer")).toContainText(
    "# Treasury rebalance",
  );
  // A bare (unencrypted) share envelope must not claim encryption.
  await expect(
    page.getByText("Shared with you", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Encrypted link")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ask about script" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & execute" }),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("first run without an API key can still reach the script", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // No nexusApiKey in localStorage — the chat surface shows the settings
  // screen, but the script context bar must stay reachable.
  await page.goto("/");

  await expect(page.getByText("Chat settings")).toBeVisible();
  const scriptButton = page.getByRole("button", { name: "Open space" });
  await expect(scriptButton).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open transaction review" }),
  ).toBeVisible();

  await openScript(page);
  await expect(
    page.getByRole("region", { name: "Script review" }),
  ).toBeVisible();

  // And back again — no dead end in either direction.
  await page.getByRole("button", { name: "Ask about script" }).click();
  await expect(page.getByText("Chat settings")).toBeVisible();
  await expect(scriptButton).toBeVisible();
});

test("chat composer state survives a surface switch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");

  const composer = page.getByPlaceholder("Describe what to do…");
  await composer.fill("send 1 xdai to vitalik.eth");

  await openScript(page);
  await expect(
    page.getByRole("region", { name: "Script review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask about script" }).click();

  // The chat panel stayed mounted, so the draft is still there.
  await expect(composer).toHaveValue("send 1 xdai to vitalik.eth");
});

test("reduced motion preference is honored in drawers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  // Emulated per-page: the context-level `use.reducedMotion` option does
  // not reach the page in the headless shell (verified — matchMedia stays
  // false), so relying on it silently tests nothing.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.getByRole("button", { name: "Open navigation" }).click();
  // The kill-switch rule must beat the mobile 120ms button transition rule.
  await expect(page.getByRole("button", { name: "EVML docs" })).not.toHaveCSS(
    "transition-duration",
    "0.12s",
  );
});

test("the on-screen keyboard shrinks the shell instead of scrolling it", async ({
  page,
}) => {
  const HEIGHT = 844;
  const KEYBOARD = 336;
  await page.setViewportSize({ width: 390, height: HEIGHT });
  // Headless Chromium has no virtual keyboard, so stand in for it: a fake
  // visualViewport that shrinks and (like iOS) reports the layout viewport
  // scrolled up under the focused input.
  await page.addInitScript(
    ([height, keyboard]) => {
      localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
      const events = new EventTarget();
      const viewport = {
        width: 390,
        height,
        offsetTop: 0,
        offsetLeft: 0,
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
      };
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        get: () => viewport,
      });
      Object.assign(window, {
        openKeyboard: () => {
          viewport.height = height - keyboard;
          viewport.offsetTop = 120;
          events.dispatchEvent(new Event("resize"));
        },
      });
    },
    [HEIGHT, KEYBOARD] as const,
  );
  await page.goto("/");

  const shell = page.locator(".mobile-terminal");
  const composer = page.getByPlaceholder("Describe what to do…");
  await expect(composer).toBeVisible();

  await page.evaluate(() =>
    (window as unknown as { openKeyboard: () => void }).openKeyboard(),
  );

  await expect
    .poll(async () => (await shell.boundingBox())?.height)
    .toBe(HEIGHT - KEYBOARD);
  const shellBox = await shell.boundingBox();
  if (!shellBox) throw new Error("shell has no box");

  // Header pinned to the top of the *visible* area, not scrolled off it.
  const headerBox = await page.locator("header").first().boundingBox();
  expect(headerBox?.y).toBe(shellBox.y);
  expect(shellBox.y).toBe(120);

  // Composer still on screen, and not flush against the keyboard.
  const composerBox = await composer.boundingBox();
  if (!composerBox) throw new Error("composer has no box");
  expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(
    shellBox.y + shellBox.height - 12,
  );
});

test("desktop breakpoint keeps the editor-first shell", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");

  // The title is the script's first line; there is no title field.
  await expect(
    page.locator(".monaco-editor .evml-title-line").first(),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Spaces" })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();
});

test("mobile home has no serious accessibility violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");
  await page
    .getByPlaceholder("Describe what to do…")
    .waitFor({ state: "visible" });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});

test("mobile menu and script surface never expose Monaco", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "EVML docs" })).toBeVisible();
  // The menu leads to the list of spaces; the list itself is the Space
  // surface.
  await expect(page.getByRole("region", { name: "Spaces" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Spaces" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New space" })).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Wallet connection" }),
  ).toContainText("Not connected");
  await expect(
    page.getByRole("button", { name: "Connect wallet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();

  // The title is the script's first comment: shown, never a field.
  await openScript(page);
  await expect(page.getByRole("heading", { name: "Untitled" })).toBeVisible();
  await expect(page.getByLabel("Script title")).toHaveCount(0);
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("workspace menu opens chat settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Chat settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Chat settings" }),
  ).toBeVisible();

  // Back returns to the conversation.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByPlaceholder("Describe what to do…")).toBeVisible();
});

test("chat history sheet lists chats and starts a new one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Previous chats" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Chats", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "New chat" })).toBeVisible();

  await sheet.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByPlaceholder("Describe what to do…")).toBeVisible();
});

test("chats belong to the browser: all are listed, labelled with where they started, and the open one survives a change of space", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const SCRIPT_A = "00000000-0000-4000-8000-00000000000a";
  await page.addInitScript(
    ({ scriptA }) => {
      localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
      if (localStorage.getItem("evmcrispr:chats")) return;
      const now = Date.now();
      localStorage.setItem(
        "evmcrispr:scripts",
        JSON.stringify({
          [scriptA]: {
            id: scriptA,
            title: "Script A",
            script: "switch gnosis",
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          },
        }),
      );
      const chats = [
        { id: "chat-a", title: "Chat for script A", scopeId: scriptA, at: 2 },
        { id: "chat-x", title: "Chat from elsewhere", scopeId: "gone", at: 1 },
      ].map(({ at, ...c }) => ({
        ...c,
        createdAt: new Date(now + at).toISOString(),
        updatedAt: new Date(now + at).toISOString(),
      }));
      localStorage.setItem("evmcrispr:chats", JSON.stringify(chats));
      for (const c of chats) {
        localStorage.setItem(
          `evmcrispr:chat:${c.id}`,
          JSON.stringify({
            id: c.id,
            items: [{ role: "user", text: `said in ${c.id}` }],
            messages: [],
          }),
        );
      }
    },
    { scriptA: SCRIPT_A },
  );
  await page.goto(`/#/${SCRIPT_A}`);
  await expect(page.getByPlaceholder("Describe what to do…")).toBeVisible();
  // The most recent chat reopens.
  await expect(page.getByText("said in chat-a")).toBeVisible();

  // Every chat is listed, whatever space it started in.
  await page.getByRole("button", { name: "Previous chats" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Chat for script A")).toBeVisible();
  await expect(sheet.getByText("Chat from elsewhere")).toBeVisible();
  await expect(sheet.getByText(/started in Script A/)).toHaveCount(1);
  await sheet.getByRole("button", { name: "Close chats" }).click();

  // A new script: the same chat stays open, and the list is the same.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "New space" }).click();
  await expect(page.getByText("Untitled", { exact: true })).toBeVisible();
  await expect(page.getByText("said in chat-a")).toBeVisible();
  await page.getByRole("button", { name: "Previous chats" }).click();
  await expect(
    page.getByRole("dialog").getByText("Chat from elsewhere"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Chat for script A"),
  ).toBeVisible();
});

test("context bar opens the review sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");

  // Activity has no standalone surface anymore — it renders inside the
  // review sheet once a simulation readies.
  await expect(page.getByRole("button", { name: "Open activity" })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Open transaction review" }).click();
  await expect(page.getByText("Review transactions")).toBeVisible();
  await expect(
    page.getByText("Simulated first. Your wallet signs last."),
  ).toBeVisible();
});

test("the Space surface shows the timeline and the list of spaces, and leads back to the chat", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Open space" }).click();
  await expect(page.getByRole("list", { name: "Timeline" })).toContainText(
    "created the script",
  );
  // A revision is viewed where the script is, without Monaco.
  await page.getByText("created the script").click();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Viewing a revision",
  );
  await page.getByRole("button", { name: "Back to current" }).click();
  await expect(
    page.getByRole("region", { name: "Script review" }),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor")).toHaveCount(0);

  // The menu leads to the list of spaces.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Spaces" }).click();
  await expect(page.getByRole("list", { name: "Spaces" })).toContainText(
    "Untitled",
  );
  await page.getByRole("button", { name: "Back to chat" }).click();
  await expect(page.getByPlaceholder("Describe what to do…")).toBeVisible();
});
