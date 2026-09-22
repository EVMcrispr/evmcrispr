import { expect, it } from "bun:test";
import inventory from "../../../../scripts/smart-command-inventory.json";

it("classifies every command and rejects missing or stale entries", async () => {
  await import(
    new URL(
      "../../../../scripts/check-smart-command-coverage.ts",
      import.meta.url,
    ).href
  );
  expect(Object.keys(inventory).length).toBeGreaterThan(150);
});
