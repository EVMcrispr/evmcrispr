import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WIDTHS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

async function openGallery(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/gallery.html");
  await page.getByRole("heading", { name: "Foundations" }).waitFor();
  return errors;
}

for (const size of WIDTHS) {
  test(`the gallery renders without errors (${size.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const errors = await openGallery(page);
    expect(errors).toEqual([]);
  });

  test(`the gallery has no serious accessibility violation (${size.name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openGallery(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations
        .filter(
          (violation) =>
            violation.impact === "serious" || violation.impact === "critical",
        )
        .map((violation) => [
          violation.id,
          violation.nodes.map((node) => node.target.join(" ")),
        ]),
    ).toEqual([]);
  });
}

test("no frame scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openGallery(page);
  const overflowing = await page
    .locator("[data-frame]")
    .evaluateAll((frames) =>
      frames
        .filter((frame) => frame.scrollWidth > frame.clientWidth)
        .map((frame) => frame.closest("section")?.id),
    );
  expect(overflowing).toEqual([]);
});

test("the touch frame gets touch sizes and the desktop frame does not", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openGallery(page);
  const probe = (frame: string) =>
    page
      .locator(`[data-frame="${frame}"] [data-touch-probe]`)
      .first()
      .evaluate((element) => getComputedStyle(element).minHeight);
  expect(await probe("touch")).toBe("44px");
  expect(await probe("desktop")).not.toBe("44px");
});

for (const form of ["dialog", "sheet"] as const) {
  test(`an open overlay has the sheet surface (${form})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openGallery(page);
    await page
      .getByRole("button", { name: `Open as ${form}`, exact: true })
      .click();
    const overlay = page.getByRole("dialog", { name: "Export space" });
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("data-overlay", form);
    // #0b0d0c: portaled to <body>, it still sees the tokens.
    expect(
      await overlay.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe("rgb(11, 13, 12)");

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
  });
}

test("the compositions show the four main screens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openGallery(page);
  const section = page.locator("#compositions");
  for (const name of ["Spaces list", "Timeline", "Review", "Assistant chat"])
    await expect(
      section.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  // Every screen is shown in both frames.
  await expect(
    section.getByRole("region", { name: "Run, paused" }),
  ).toHaveCount(2);
});

test("the menu, the tabs and a toast work on Base UI", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openGallery(page);
  const section = page.locator("#primitives");

  await section.getByRole("button", { name: "Space menu" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Clear for me" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);

  await section.getByRole("tab", { name: "Agents" }).click();
  // By the tab it belongs to: the panel being left is still there while
  // it goes.
  await expect(section.getByRole("tabpanel", { name: "Agents" })).toHaveText(
    "Your chats with the assistant.",
  );

  await section.getByRole("button", { name: "Loading" }).click();
  await expect(page.getByText("Pinning 1 file to IPFS")).toBeVisible();
  // The same toast is replaced in place, not joined by a second one.
  await expect(page.getByText("Pinned 1 file to IPFS")).toBeVisible();
  await expect(page.getByText("Pinning 1 file to IPFS")).toHaveCount(0);
});
