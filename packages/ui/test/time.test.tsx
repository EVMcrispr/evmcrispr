import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AuthorLabel, ago, clock, day, duration, Time } from "../src";

const NOW = new Date("2026-10-11T12:00:00Z").getTime();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

test("ago says it in the fewest words", () => {
  expect(ago(NOW - 10_000, NOW)).toBe("just now");
  expect(ago(NOW - 5 * MINUTE, NOW)).toBe("5 min ago");
  expect(ago(NOW - 3 * HOUR, NOW)).toBe("3 h ago");
  expect(ago(NOW - 48 * HOUR, NOW)).toBe(day(NOW - 48 * HOUR));
});

test("a time in the future is just now", () => {
  expect(ago(NOW + 5 * MINUTE, NOW)).toBe("just now");
  expect(duration(-500)).toBe("under a minute");
});

test("clock gives the hour today and the day before that", () => {
  expect(clock(NOW, NOW)).not.toContain("2026");
  expect(clock(NOW - 48 * HOUR, NOW)).toContain("2026");
});

test("duration reads as a length of time", () => {
  expect(duration(20_000)).toBe("under a minute");
  expect(duration(7 * MINUTE)).toBe("7 min");
  expect(duration(2 * HOUR + 5 * MINUTE)).toBe("2 h 5 min");
  expect(duration(3 * HOUR)).toBe("3 h");
});

test("Time is a time element carrying the exact moment", () => {
  render(<Time at={NOW - 5 * MINUTE} now={NOW} />);
  const time = screen.getByText("5 min ago");
  expect(time.tagName).toBe("TIME");
  expect(time).toHaveAttribute(
    "datetime",
    new Date(NOW - 5 * MINUTE).toISOString(),
  );
  expect(time.getAttribute("title")).toContain("2026");
});

test("Time with a moment that is not a number shows nothing", () => {
  const { container } = render(<Time at={Number.NaN} now={NOW} />);
  expect(container).toBeEmptyDOMElement();
});

test("a claimed author is shown as unverified, with the claim", () => {
  render(<AuthorLabel name="An export" claimed="You" />);
  expect(screen.getByText("An export").className).toContain("text-unverified");
  expect(screen.getByText("(it names You)")).toBeInTheDocument();
});

test("an author nobody disputes is plain", () => {
  render(<AuthorLabel name="You" />);
  expect(screen.getByText("You").className).not.toContain("text-unverified");
});
