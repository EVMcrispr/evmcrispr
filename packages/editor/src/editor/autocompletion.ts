import type { CompletionItem, CompletionItemKind } from "@evmcrispr/core";
import type { IRange } from "monaco-editor";
import { languages } from "monaco-editor";

const kindMap: Record<CompletionItemKind, languages.CompletionItemKind> = {
  command: languages.CompletionItemKind.Keyword,
  helper: languages.CompletionItemKind.Property,
  variable: languages.CompletionItemKind.Variable,
  field: languages.CompletionItemKind.Field,
};

export function toMonacoCompletionItem(
  item: CompletionItem,
  range: IRange,
): languages.CompletionItem {
  const inlineDesc = item.detail ?? item.documentation;
  const label: string | languages.CompletionItemLabel = inlineDesc
    ? { label: item.label, description: inlineDesc }
    : item.label;

  return {
    label,
    insertText: item.insertText,
    kind: kindMap[item.kind],
    range,
    sortText: item.sortPriority != null ? String(item.sortPriority) : undefined,
    insertTextRules: item.isSnippet
      ? languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
  };
}
