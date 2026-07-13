import { describe, expect, test } from "bun:test";
import { resolveDocLinkEntry as resolve } from "../../src/data/reference-core";
import { loadReferenceEntries } from "../utils/reference-entries";

const referenceEntries = await loadReferenceEntries();

const resolveDocLinkEntry = (href: string, currentModule?: string) =>
  resolve(referenceEntries, href, currentModule);

describe("resolveDocLinkEntry", () => {
  test("resolves a same-module relative helper link", () => {
    const entry = resolveDocLinkEntry("../helpers/contract.next.md", "std");
    expect(entry).not.toBeNull();
    expect(entry).not.toBe("unresolved");
    expect((entry as { name: string }).name).toBe("contract.next");
    expect((entry as { kind: string }).kind).toBe("helper");
    expect((entry as { module: string }).module).toBe("std");
  });

  test("resolves a bare sibling link by name", () => {
    const entry = resolveDocLinkEntry("token.amount.md", "std");
    expect((entry as { name: string }).name).toBe("token.amount");
  });

  test("resolves a cross-module link to the right module", () => {
    const entry = resolveDocLinkEntry(
      "../../../std/src/helpers/contract.codeAt.md",
      "sim",
    );
    expect((entry as { name: string }).name).toBe("contract.codeAt");
    expect((entry as { module: string }).module).toBe("std");
  });

  test("resolves lang helper links", () => {
    const entry = resolveDocLinkEntry("filter.md", "lang");
    expect((entry as { name: string }).name).toBe("filter");
    expect((entry as { module: string }).module).toBe("lang");
  });

  test("resolves command links regardless of broken relative depth", () => {
    // std/src/helpers/arr.md links "../../commands/loop.md"
    const entry = resolveDocLinkEntry("../../commands/loop.md", "std");
    expect((entry as { name: string }).name).toBe("loop");
    expect((entry as { kind: string }).kind).toBe("command");
  });

  test("returns null for absolute URLs", () => {
    expect(resolveDocLinkEntry("https://example.com/page", "std")).toBeNull();
    expect(
      resolveDocLinkEntry("https://example.com/file.md", "std"),
    ).toBeNull();
  });

  test("returns null for non-md relative links", () => {
    expect(resolveDocLinkEntry("../foo/bar", "std")).toBeNull();
  });

  test("returns 'unresolved' for doc links with no matching entry", () => {
    expect(resolveDocLinkEntry("../helpers/does-not-exist.md", "std")).toBe(
      "unresolved",
    );
  });

  test("lang module entries are present in the reference list", () => {
    const langEntries = referenceEntries.filter((e) => e.module === "lang");
    expect(langEntries.length).toBeGreaterThan(0);
    expect(langEntries.some((e) => e.name === "map")).toBe(true);
  });
});
