export type HoverRef = {
  kind: "command" | "helper";
  name: string;
  module?: string;
};

export type HoverInfo = {
  /**
   * Markdown-formatted hover content. Each entry is rendered as a separate
   * Monaco hover "card" with the editor's native divider between them.
   * Use multiple entries when you want a clear visual separator (e.g. between
   * a helper signature and an address details card).
   */
  contents: string[];
  /**
   * Set only when the hovered token is a command or helper invocation
   * (not a variable, address, option, or parameter). Lets callers offer an
   * explicit "open docs" action for the reference panel without having to
   * re-derive the resolved module/name from the raw token.
   */
  ref?: HoverRef;
};
