export type HoverInfo = {
  /**
   * Markdown-formatted hover content. Each entry is rendered as a separate
   * Monaco hover "card" with the editor's native divider between them.
   * Use multiple entries when you want a clear visual separator (e.g. between
   * a helper signature and an address details card).
   */
  contents: string[];
};
