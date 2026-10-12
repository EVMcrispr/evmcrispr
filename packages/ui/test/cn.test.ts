import { expect, test } from "bun:test";
import { cn } from "../src/utils";

test("cn keeps a type size beside a text colour", () => {
  expect(cn("text-caption", "text-fg-muted")).toBe(
    "text-caption text-fg-muted",
  );
  expect(cn("text-fg", "text-display")).toBe("text-fg text-display");
});

test("cn lets a later type size replace an earlier one", () => {
  expect(cn("text-body", "text-caption")).toBe("text-caption");
});

test("cn lets a later colour replace an earlier one", () => {
  expect(cn("text-fg", "text-danger")).toBe("text-danger");
  expect(cn("bg-surface-1", "bg-surface-active")).toBe("bg-surface-active");
});
