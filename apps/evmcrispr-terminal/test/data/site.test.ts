import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { docsPage, SITE_URL } from "../../src/data/site";
import { loadReferenceEntries } from "../utils/reference-entries";

test("a command's or a helper's page is named as the website names it", () => {
  expect(docsPage({ module: "std", kind: "command", name: "exec" })).toBe(
    `${SITE_URL}/reference/std/commands/exec/`,
  );
  // The site drops the punctuation of a file's name, and an on-chain
  // face (`balance!`) is on its helper's page.
  expect(docsPage({ module: "token", kind: "helper", name: "balance!" })).toBe(
    `${SITE_URL}/reference/token/helpers/balance/`,
  );
  expect(docsPage({ module: "std", kind: "helper", name: "abi.decode" })).toBe(
    `${SITE_URL}/reference/std/helpers/abidecode/`,
  );
});

test("every entry of the panel has its page among the website's docs", async () => {
  const docs = path.resolve(
    import.meta.dir,
    "../../../evmcrispr-website/src/content/docs/reference",
  );
  const missing = (await loadReferenceEntries())
    .filter(
      (entry) =>
        !existsSync(
          path.join(
            docs,
            entry.module,
            `${entry.kind}s`,
            // An on-chain face is documented on the page of its helper.
            `${entry.name.replace(/!$/, "")}.md`,
          ),
        ),
    )
    .map((entry) => `${entry.module}/${entry.kind}s/${entry.name}`);
  expect(missing).toEqual([]);
});

test("a helper and its on-chain face are one entry, marked on-chain", async () => {
  const entries = await loadReferenceEntries();
  const named = (name: string) =>
    entries.filter(
      (entry) =>
        entry.module === "std" &&
        entry.kind === "helper" &&
        entry.name === name,
    );
  expect(named("abi.decode")).toHaveLength(1);
  expect(named("abi.decode")[0].onchain).toBe(true);
  expect(named("abi.decode!")).toHaveLength(0);
  // A face listed under its own name has no plain helper beside it.
  for (const entry of entries.filter((e) => e.name.endsWith("!")))
    expect(
      entries.some(
        (e) => e.module === entry.module && `${e.name}!` === entry.name,
      ),
    ).toBe(false);
});
