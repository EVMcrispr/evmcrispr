export type CompletionItemKind = "command" | "helper" | "variable" | "field";

export type CompletionItem = {
  label: string;
  insertText: string;
  kind: CompletionItemKind;
  sortPriority?: number;
};
