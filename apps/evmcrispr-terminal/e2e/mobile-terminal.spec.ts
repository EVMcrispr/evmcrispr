import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
    await expect(page.getByText("Untitled script")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Script", exact: true }),
    ).toHaveCount(0);

    // Chat switching lives behind one composer button, not a third
    // chrome bar.
    await expect(
      page.getByRole("button", { name: "Previous chats" }),
    ).toBeVisible();
    await expect(page.getByText("DappNode Nexus")).toHaveCount(0);

    await page.getByRole("button", { name: "Open script" }).click();
    await expect(page.getByText("READ ONLY")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review & execute" }),
    ).toBeVisible();
    await expect(page.locator(".monaco-editor")).toHaveCount(0);
  });
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

  await expect(page.getByText("Treasury rebalance")).toBeVisible();
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
  const scriptButton = page.getByRole("button", { name: "Open script" });
  await expect(scriptButton).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open transaction review" }),
  ).toBeVisible();

  await scriptButton.click();
  await expect(page.getByText("READ ONLY")).toBeVisible();

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

  await page.getByRole("button", { name: "Open script" }).click();
  await expect(page.getByText("READ ONLY")).toBeVisible();
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
  await expect(
    page.getByRole("button", { name: "EVML reference" }),
  ).not.toHaveCSS("transition-duration", "0.12s");
});

test("desktop breakpoint keeps the editor-first shell", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");

  await expect(page.getByPlaceholder("Untitled script")).toBeVisible();
  await expect(page.getByText("Library", { exact: true })).toBeVisible();
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

test("mobile menu edits metadata without exposing Monaco", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "EVML reference" }),
  ).toBeVisible();
  // Previous scripts fill the menu inline — no library sub-page, no
  // redundant visible label (the section keeps an aria name).
  await expect(
    page.getByRole("region", { name: "Previous scripts" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Search")).toBeVisible();
  await expect(page.getByRole("button", { name: "New script" })).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Wallet connection" }),
  ).toContainText("Not connected");
  await expect(
    page.getByRole("button", { name: "Connect wallet" }),
  ).toBeVisible();
  // Renaming lives on the script surface, not in the menu.
  await expect(page.getByLabel("Script title")).toHaveCount(0);
  await page.getByRole("button", { name: "Close workspace menu" }).click();

  await page.getByRole("button", { name: "Open script" }).click();
  await page.getByLabel("Script title").fill("Mobile treasury batch");
  await expect(page.getByLabel("Script title")).toHaveValue(
    "Mobile treasury batch",
  );
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

test("chats are scoped to their script; a new script starts fresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const SCRIPT_A = "00000000-0000-4000-8000-00000000000a";
  await page.addInitScript(
    ({ scriptA }) => {
      localStorage.setItem("evmcrispr:nexusApiKey", "e2e-placeholder");
      const now = new Date().toISOString();
      localStorage.setItem(
        "evmcrispr:scripts",
        JSON.stringify({
          [scriptA]: {
            id: scriptA,
            title: "Script A",
            script: "switch gnosis",
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
      const chats = [
        { id: "chat-a", title: "Chat for script A", scriptId: scriptA },
        { id: "chat-x", title: "Chat for another script", scriptId: "other" },
      ].map((c) => ({ ...c, createdAt: now, updatedAt: now }));
      localStorage.setItem("evmcrispr:chats", JSON.stringify(chats));
      for (const c of chats) {
        localStorage.setItem(
          `evmcrispr:chat:${c.id}`,
          JSON.stringify({ id: c.id, items: [], messages: [] }),
        );
      }
    },
    { scriptA: SCRIPT_A },
  );
  await page.goto(`/#/${SCRIPT_A}`);
  await expect(page.getByPlaceholder("Describe what to do…")).toBeVisible();

  // Only script A's chat is listed.
  await page.getByRole("button", { name: "Previous chats" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Chat for script A")).toBeVisible();
  await expect(sheet.getByText("Chat for another script")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close chats" }).click();

  // A new script starts with no previous chats of its own.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "New script" }).click();
  await page.getByRole("button", { name: "Previous chats" }).click();
  await expect(
    page.getByRole("dialog").getByText("No previous chats"),
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
