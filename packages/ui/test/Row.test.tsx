import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Row } from "../src";

test("a row with onClick is a button and calls it", () => {
  const open = mock(() => {});
  render(<Row title="Swap on Gnosis" onClick={open} />);
  fireEvent.click(screen.getByRole("button", { name: "Swap on Gnosis" }));
  expect(open).toHaveBeenCalledTimes(1);
});

test("a row with href is a link", () => {
  render(<Row title="exec" href="#/reference/exec" />);
  expect(screen.getByRole("link", { name: "exec" })).toHaveAttribute(
    "href",
    "#/reference/exec",
  );
});

test("a row with neither is not interactive", () => {
  render(<Row title="You cleared the timeline" />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});

test("an active row says so", () => {
  render(<Row title="Swap on Gnosis" active onClick={() => {}} />);
  expect(screen.getByRole("button")).toHaveAttribute("aria-current", "true");
});

test("an expandable row reports whether it is open and shows its content", () => {
  const change = mock((_open: boolean) => {});
  const { rerender } = render(
    <Row title="Assistant added a fee" open={false} onOpenChange={change}>
      <span>the actions</span>
    </Row>,
  );
  const button = screen.getByRole("button");
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("the actions")).toBeNull();
  fireEvent.click(button);
  expect(change.mock.calls[0][0]).toBe(true);
  rerender(
    <Row title="Assistant added a fee" open onOpenChange={change}>
      <span>the actions</span>
    </Row>,
  );
  expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("the actions")).toBeVisible();
});

test("a row that cannot expand has no aria-expanded", () => {
  render(<Row title="Swap on Gnosis" onClick={() => {}} />);
  expect(screen.getByRole("button")).not.toHaveAttribute("aria-expanded");
});

test("trailing actions are not inside the row's button", () => {
  render(
    <Row
      title="Swap on Gnosis"
      onClick={() => {}}
      actions={<button type="button">Remove</button>}
    />,
  );
  const main = screen.getByRole("button", { name: "Swap on Gnosis" });
  expect(within(main).queryByRole("button")).toBeNull();
  expect(screen.getByRole("button", { name: "Remove" })).toBeVisible();
});

test("a disabled row cannot be clicked", () => {
  const open = mock(() => {});
  render(<Row title="Swap on Gnosis" onClick={open} disabled />);
  fireEvent.click(screen.getByRole("button"));
  expect(open).not.toHaveBeenCalled();
});

test("a row renders as a list item when asked", () => {
  render(
    <ul>
      <Row as="li" title="Swap on Gnosis" />
    </ul>,
  );
  expect(screen.getByRole("listitem")).toHaveTextContent("Swap on Gnosis");
});

test("a row that does not expand always shows what is under it", () => {
  render(
    <Row title="Assistant changed the target">
      <button type="button">Revert this change</button>
    </Row>,
  );
  expect(
    screen.getByRole("button", { name: "Revert this change" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { expanded: true })).toBeNull();
});
