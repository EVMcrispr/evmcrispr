import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Badge, Chip, DiffStat, Dot } from "../src";

test("a badge shows its text in its tone", () => {
  render(<Badge tone="unverified">unreviewed</Badge>);
  expect(screen.getByText("unreviewed").className).toContain("text-unverified");
});

test("a tag badge is framed and filled, a plain one is not", () => {
  render(
    <>
      <Badge tone="warning">paused</Badge>
      <Badge tone="warning" variant="tag">
        command
      </Badge>
    </>,
  );
  expect(screen.getByText("paused").className).not.toContain("border");
  expect(screen.getByText("command").className).toContain("bg-warning-surface");
  expect(screen.getByText("command").className).toContain("border-warning");
});

test("a dot alone is decoration unless it is given a name", () => {
  const { container } = render(<Dot tone="success" />);
  expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  render(<Dot tone="warning" label="Run paused" />);
  expect(screen.getByRole("img", { name: "Run paused" })).toBeInTheDocument();
});

test("a chip says whether it is selected and asks to change", () => {
  const change = mock((_selected: boolean) => {});
  render(
    <>
      <Chip selected>All</Chip>
      <Chip onSelectedChange={change}>Runs</Chip>
    </>,
  );
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const runs = screen.getByRole("button", { name: "Runs" });
  expect(runs).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(runs);
  expect(change).toHaveBeenCalledWith(true);
});

test("a diff stat reads as words", () => {
  render(<DiffStat added={3} removed={1} />);
  expect(screen.getByLabelText("3 lines added, 1 removed")).toHaveTextContent(
    "+3 −1",
  );
});
