import { expect, mock, spyOn, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button, IconButton, Spinner } from "../src";

test("a loading button is disabled, busy and shows a spinner", () => {
  const click = mock(() => {});
  render(
    <Button loading onClick={click}>
      Approve
    </Button>,
  );
  const button = screen.getByRole("button", { name: /Approve/ });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});

test("a button that is not loading has no spinner and can be clicked", () => {
  const click = mock(() => {});
  render(<Button onClick={click}>Approve</Button>);
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button"));
  expect(click).toHaveBeenCalledTimes(1);
});

test("a button is a button unless told to submit", () => {
  render(
    <>
      <Button>a</Button>
      <Button type="submit">b</Button>
    </>,
  );
  const [plain, submit] = screen.getAllByRole("button");
  expect(plain).toHaveAttribute("type", "button");
  expect(submit).toHaveAttribute("type", "submit");
});

test("asChild puts the button's look on the child element", () => {
  render(
    <Button asChild variant="primary">
      <a href="/docs">Docs</a>
    </Button>,
  );
  const link = screen.getByRole("link", { name: "Docs" });
  expect(link).toHaveAttribute("href", "/docs");
  expect(link.className).toContain("bg-primary");
  expect(screen.queryByRole("button")).toBeNull();
});

test("raised variants carry the hard shadow, quiet and ghost do not", () => {
  render(
    <>
      <Button variant="primary">a</Button>
      <Button variant="neutral">b</Button>
      <Button variant="destructive">c</Button>
      <Button variant="quiet">d</Button>
      <Button variant="ghost">e</Button>
    </>,
  );
  const [primary, neutral, destructive, quiet, ghost] =
    screen.getAllByRole("button");
  for (const raised of [primary, neutral, destructive])
    expect(raised.className).toContain("shadow-md");
  for (const flat of [quiet, ghost])
    expect(flat.className).not.toContain("shadow-md");
});

test("a spinner names what it is waiting for", () => {
  render(<Spinner label="Simulating" />);
  expect(screen.getByRole("status", { name: "Simulating" })).toBeVisible();
});

test("an icon button without a name is reported", () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  render(<IconButton>x</IconButton>);
  expect(error.mock.calls.flat().join(" ")).toContain("IconButton needs");
  error.mockClear();
  render(<IconButton aria-label="Remove space">x</IconButton>);
  render(<IconButton title="Remove space">x</IconButton>);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test("a row action with an icon keeps its text as its name", () => {
  render(
    <Button variant="quiet" size="row" icon={<svg data-testid="eye" />}>
      View
    </Button>,
  );
  const button = screen.getByRole("button", { name: "View" });
  // The icon with its text; on touch, the icon alone.
  expect(screen.getByText("View").className).toContain("touch:sr-only");
  expect(screen.getByTestId("eye").parentElement).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(button.className).toContain("touch:min-w-11");
});

test("an icon button says what it does when hovered", async () => {
  render(<IconButton aria-label="Remove space">x</IconButton>);
  const button = screen.getByRole("button", { name: "Remove space" });
  fireEvent.focus(button);
  expect(await screen.findByText("Remove space")).toBeVisible();
});

test("an icon button's own tooltip replaces the browser's, and its name stays", () => {
  render(
    <IconButton aria-label="Remove Swap on Gnosis" title="Remove space">
      x
    </IconButton>,
  );
  const button = screen.getByRole("button", { name: "Remove Swap on Gnosis" });
  expect(button).not.toHaveAttribute("title");
});

test("an icon button told to say nothing has no tooltip", () => {
  render(
    <IconButton aria-label="Share script" tooltip={false}>
      x
    </IconButton>,
  );
  fireEvent.focus(screen.getByRole("button", { name: "Share script" }));
  expect(screen.queryByText("Share script")).toBeNull();
});
