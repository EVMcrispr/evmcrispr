import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import {
  BackButton,
  EmptyState,
  Input,
  Notice,
  PanelHeader,
  Textarea,
} from "../src";

test("a back button names where it goes", () => {
  const back = mock(() => {});
  render(<BackButton label="Spaces" onClick={back} />);
  const button = screen.getByRole("button", { name: "Back to Spaces" });
  expect(button).toHaveTextContent("Spaces");
  fireEvent.click(button);
  expect(back).toHaveBeenCalledTimes(1);
});

test("a panel header shows its title as a heading", () => {
  render(
    <PanelHeader
      title="Swap on Gnosis"
      back={<BackButton label="Spaces" onClick={() => {}} />}
      actions={<button type="button">Menu</button>}
    />,
  );
  expect(screen.getByRole("heading", { name: "Swap on Gnosis" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Menu" })).toBeVisible();
});

test("a danger notice interrupts, a live one is announced, the rest are notes", () => {
  render(<Notice tone="danger">Could not reach IPFS.</Notice>);
  expect(screen.getByRole("alert")).toHaveTextContent("Could not reach IPFS.");
  render(
    <Notice tone="info" live>
      Checking the script…
    </Notice>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Checking the script…");
  render(<Notice tone="warning">Nothing will be saved.</Notice>);
  expect(screen.getByRole("note")).toHaveTextContent("Nothing will be saved.");
});

test("an urgent notice interrupts whatever its tone", () => {
  render(
    <Notice tone="warning" urgent>
      Later edits touch the same lines.
    </Notice>,
  );
  expect(screen.getByRole("alert")).toBeVisible();
});

test("a notice shows its title and its action", () => {
  render(
    <Notice
      tone="warning"
      title="Viewing an earlier revision"
      action={<button type="button">Back to current</button>}
    >
      The script is untouched.
    </Notice>,
  );
  expect(screen.getByText("Viewing an earlier revision")).toBeVisible();
  expect(screen.getByRole("button", { name: "Back to current" })).toBeVisible();
});

test("an inline notice is text with no box", () => {
  render(
    <Notice tone="danger" layout="inline">
      The link is not valid.
    </Notice>,
  );
  const notice = screen.getByRole("alert");
  expect(notice.className).not.toContain("border");
  expect(notice.className).toContain("text-danger");
});

test("an empty state shows its sentence and its action", () => {
  render(
    <EmptyState action={<button type="button">New space</button>}>
      No spaces yet.
    </EmptyState>,
  );
  expect(screen.getByText("No spaces yet.")).toBeVisible();
  expect(screen.getByRole("button", { name: "New space" })).toBeVisible();
});

test("the default input is unchanged", () => {
  render(<Input aria-label="Safe address" />);
  const input = screen.getByRole("textbox", { name: "Safe address" });
  expect(input.className).toContain("border-border");
  expect(input.className).toContain("font-head");
});

test("a quiet input is on the surface tokens", () => {
  render(<Input variant="quiet" aria-label="Link" readOnly value="ipfs://x" />);
  const input = screen.getByRole("textbox", { name: "Link" });
  expect(input.className).toContain("bg-surface-1");
  expect(input.className).toContain("border-edge");
});

test("a search input is a search box whose ref is the input", () => {
  const ref = createRef<HTMLInputElement>();
  render(<Input ref={ref} variant="search" aria-label="Search spaces" />);
  const input = screen.getByRole("searchbox", { name: "Search spaces" });
  expect(ref.current).toBe(input as HTMLInputElement);
});

test("an input reports what is typed", () => {
  const change = mock((_value: string) => {});
  render(
    <Input
      variant="quiet"
      aria-label="Name"
      onChange={(event) => change(event.target.value)}
    />,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
  expect(change).toHaveBeenCalledWith("abc");
});

test("a quiet textarea is on the surface tokens", () => {
  render(<Textarea variant="quiet" aria-label="Message" />);
  expect(screen.getByRole("textbox").className).toContain("bg-surface-1");
});
