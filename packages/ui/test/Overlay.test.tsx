import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Overlay } from "../src";

for (const sheet of [false, true]) {
  const form = sheet ? "sheet" : "dialog";

  test(`as a ${form}, it is a dialog named by its title`, () => {
    render(
      <Overlay open onOpenChange={() => {}} title="Export space" sheet={sheet}>
        The link gives permanent access.
      </Overlay>,
    );
    const dialog = screen.getByRole("dialog", { name: "Export space" });
    expect(dialog).toHaveTextContent("The link gives permanent access.");
    expect(dialog).toHaveAttribute("data-overlay", form);
  });

  test(`as a ${form}, its close button asks to close`, () => {
    const change = mock((_open: boolean) => {});
    render(
      <Overlay open onOpenChange={change} title="Export space" sheet={sheet}>
        body
      </Overlay>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(change.mock.calls[0][0]).toBe(false);
  });

  test(`as a ${form}, it shows its footer`, () => {
    render(
      <Overlay
        open
        onOpenChange={() => {}}
        title="Clear timeline"
        sheet={sheet}
        footer={<button type="button">Clear</button>}
      >
        body
      </Overlay>,
    );
    expect(screen.getByRole("button", { name: "Clear" })).toBeVisible();
  });
}

test("closed, it renders nothing", () => {
  render(
    <Overlay open={false} onOpenChange={() => {}} title="Export space">
      body
    </Overlay>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("left to itself, a narrow screen gets the sheet", () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  render(
    <Overlay open onOpenChange={() => {}} title="Export space">
      body
    </Overlay>,
  );
  expect(screen.getByRole("dialog")).toHaveAttribute("data-overlay", "sheet");
  window.matchMedia = original;
});
