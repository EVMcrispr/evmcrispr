import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Card, Well } from "../src";

test("a card is a labelled region", () => {
  render(
    <Card aria-label="Run, paused">
      <Card.Header title="Run" />
    </Card>,
  );
  expect(screen.getByRole("region", { name: "Run, paused" })).toBeVisible();
});

test("a collapsible card hides its body and asks to open", () => {
  const change = mock((_open: boolean) => {});
  render(
    <Card open={false} onOpenChange={change}>
      <Card.Header title="Simulation" />
      <Card.Body>the logs</Card.Body>
    </Card>,
  );
  const button = screen.getByRole("button", { name: /Simulation/ });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("the logs")).toBeNull();
  fireEvent.click(button);
  expect(change.mock.calls[0][0]).toBe(true);
});

test("an open collapsible card shows its body", () => {
  render(
    <Card open onOpenChange={() => {}}>
      <Card.Header title="Simulation" />
      <Card.Body>the logs</Card.Body>
    </Card>,
  );
  expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("the logs")).toBeVisible();
});

test("a card that does not collapse has no toggle and shows its body", () => {
  render(
    <Card>
      <Card.Header title="Permission" />
      <Card.Body>the question</Card.Body>
    </Card>,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("the question")).toBeVisible();
});

test("header actions are not inside the toggle", () => {
  render(
    <Card open onOpenChange={() => {}}>
      <Card.Header
        title="Run"
        actions={<button type="button">Cancel</button>}
      />
    </Card>,
  );
  const toggle = screen.getByRole("button", { name: /Run/ });
  expect(within(toggle).queryByRole("button")).toBeNull();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("a card takes the frame of its tone", () => {
  render(
    <Card tone="warning" aria-label="paused">
      <Card.Body>held</Card.Body>
    </Card>,
  );
  expect(screen.getByRole("region").className).toContain("border-warning");
});

test("a well keeps its text as written", () => {
  render(<Well>{"exec @token\n  transfer"}</Well>);
  expect(screen.getByText(/exec @token/).tagName).toBe("PRE");
});

test("a footer's summary opens a collapsible card, beside its buttons", () => {
  const change = mock((_open: boolean) => {});
  render(
    <Card open={false} onOpenChange={change} aria-label="Run, running">
      <Card.Header title="Run" />
      <Card.Body>the logs</Card.Body>
      <Card.Footer summary="> Swapping 250 WXDAI for GNO">
        <button type="button">Stop</button>
      </Card.Footer>
    </Card>,
  );
  const summary = screen.getByRole("button", {
    name: "> Swapping 250 WXDAI for GNO",
  });
  expect(summary).toHaveAttribute("aria-expanded", "false");
  expect(within(summary).queryByRole("button")).toBeNull();
  fireEvent.click(summary);
  expect(change.mock.calls[0][0]).toBe(true);
  expect(screen.getByRole("button", { name: "Stop" })).toBeVisible();
});

test("on a card that does not collapse, the summary is plain text", () => {
  render(
    <Card>
      <Card.Footer summary="waiting for your wallet">
        <button type="button">Stop</button>
      </Card.Footer>
    </Card>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByText("waiting for your wallet")).toBeVisible();
});
