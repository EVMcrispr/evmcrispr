import "../setup";
import { beforeAll, describe, it } from "bun:test";

import type { CompletionItem, CompletionItemKind } from "@evmcrispr/sdk";
import { expect } from "@evmcrispr/test-utils";
import { evml, type EvmlWorkspace } from "@evmcrispr/test-utils/evml";

const onlyKind = (
  items: CompletionItem[],
  kind: CompletionItemKind,
): CompletionItem[] => items.filter((i) => i.kind === kind);

const LOAD_PREFIX = "load http\n";

// ---------------------------------------------------------------------------
// Tests – @json json-path completions
// ---------------------------------------------------------------------------

describe("Completions – @json json-path autocomplete", () => {
  let evm: EvmlWorkspace;

  const hasLabel = (items: CompletionItem[], label: string): boolean =>
    items.some((i) => i.label === label);

  const hasInsertText = (items: CompletionItem[], text: string): boolean =>
    items.some((i) => i.insertText === text);

  const TOKENLIST_URL = "https://api.evmcrispr.com/tokenlist/1";

  beforeAll(() => {
    evm = evml.workspace();
  });

  it('@json(@fetch(url) "$.<cursor>") should suggest root-level keys without suffix', async () => {
    const before = `${LOAD_PREFIX}print @json(@fetch("${TOKENLIST_URL}") "$.`;
    const after = '")';
    const script = before + after;
    const position = { line: 2, col: before.length - LOAD_PREFIX.length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems).to.have.lengthOf(7);
    expect(hasLabel(fieldItems, "$.name")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens")).to.be.true;
    expect(hasLabel(fieldItems, "$.version")).to.be.true;
    expect(hasLabel(fieldItems, "$.tags")).to.be.true;
    expect(hasInsertText(fieldItems, "$.tokens")).to.be.true;
    expect(hasInsertText(fieldItems, "$.name")).to.be.true;
  });

  it('@json(@fetch(url) "$.tokens<cursor>") should suggest array indices', async () => {
    const before = `${LOAD_PREFIX}print @json(@fetch("${TOKENLIST_URL}") "$.tokens`;
    const after = '")';
    const script = before + after;
    const position = { line: 2, col: before.length - LOAD_PREFIX.length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems).to.have.lengthOf(3);
    expect(hasLabel(fieldItems, "$.tokens[0]")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens[2]")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens[*]")).to.be.true;
    expect(hasInsertText(fieldItems, "$.tokens[0]")).to.be.true;
    expect(hasInsertText(fieldItems, "$.tokens[*]")).to.be.true;
  });

  it('@json(@fetch(url) "$.tokens[<cursor>") should also suggest array indices', async () => {
    const before = `${LOAD_PREFIX}print @json(@fetch("${TOKENLIST_URL}") "$.tokens[`;
    const after = '")';
    const script = before + after;
    const position = { line: 2, col: before.length - LOAD_PREFIX.length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems).to.have.lengthOf(3);
    expect(hasLabel(fieldItems, "$.tokens[0]")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens[*]")).to.be.true;
    expect(hasInsertText(fieldItems, "0]")).to.be.true;
    expect(hasInsertText(fieldItems, "*]")).to.be.true;
  });

  it('@json(@fetch(url) "$.tokens[0]<cursor>") should suggest token keys with dot prefix', async () => {
    const before = `${LOAD_PREFIX}print @json(@fetch("${TOKENLIST_URL}") "$.tokens[0]`;
    const after = '")';
    const script = before + after;
    const position = { line: 2, col: before.length - LOAD_PREFIX.length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems).to.have.lengthOf(6);
    expect(hasLabel(fieldItems, "$.tokens[0].name")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens[0].address")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens[0].symbol")).to.be.true;
    expect(hasInsertText(fieldItems, ".name")).to.be.true;
    expect(hasInsertText(fieldItems, ".address")).to.be.true;
  });

  it('@json(@fetch(url) "$.tokens[*].<cursor>") should suggest token keys', async () => {
    const before = `${LOAD_PREFIX}print @json(@fetch("${TOKENLIST_URL}") "$.tokens[*].`;
    const after = '")';
    const script = before + after;
    const position = { line: 2, col: before.length - LOAD_PREFIX.length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems).to.have.lengthOf(6);
    expect(hasLabel(fieldItems, "$.tokens[*].name")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens[*].address")).to.be.true;
    expect(hasInsertText(fieldItems, ".name")).to.be.true;
    expect(hasInsertText(fieldItems, ".address")).to.be.true;
  });

  it('mid-string cursor "$.tokens[0].<cursor>name" should suggest based on path up to cursor', async () => {
    const before = `${LOAD_PREFIX}print @json(@fetch("${TOKENLIST_URL}") "$.tokens[0].`;
    const after = 'name")';
    const script = before + after;
    const position = { line: 2, col: before.length - LOAD_PREFIX.length };
    const items = await evm.getCompletions(script, position);
    const fieldItems = onlyKind(items, "field");
    expect(fieldItems).to.have.lengthOf(6);
    expect(hasLabel(fieldItems, "$.tokens[0].name")).to.be.true;
    expect(hasLabel(fieldItems, "$.tokens[0].address")).to.be.true;
  });
});
