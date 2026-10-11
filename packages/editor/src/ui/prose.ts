/** Markdown set the same wherever it is shown (a docs entry, a message of
 *  the assistant, what a run prints): body text at the body size, section
 *  headings in the heading colour, tables and code one step down. */
export const PROSE = [
  "prose prose-invert prose-sm max-w-none wrap-break-word font-sans text-body text-fg-muted",
  "prose-p:my-2 prose-p:leading-snug prose-li:my-0.5 prose-li:leading-snug prose-ul:my-2 prose-ol:my-2",
  "prose-headings:font-head prose-headings:font-bold prose-headings:leading-tight prose-headings:text-fg",
  "prose-h1:text-display prose-h2:mt-5 prose-h2:mb-2 prose-h2:text-title prose-h2:text-heading prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:text-body",
  "prose-strong:text-fg prose-a:text-success",
  "prose-code:rounded-(--radius) prose-code:bg-surface-active prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-caption prose-code:font-normal prose-code:text-fg prose-code:before:content-none prose-code:after:content-none",
  "prose-pre:my-2 prose-pre:border-2 prose-pre:border-line prose-pre:bg-surface-well",
  "prose-table:my-2 prose-table:text-caption prose-th:px-2 prose-th:py-1 prose-th:font-head prose-th:font-medium prose-th:text-fg-faint prose-td:px-2 prose-td:py-1.5 prose-td:align-top prose-td:text-fg-muted [&_td:nth-child(2)_code]:whitespace-nowrap [&_td:nth-child(n+3)_code]:wrap-anywhere prose-thead:border-line prose-tr:border-line",
  "prose-hr:my-4 prose-hr:border-line",
  // The margins set above must not open a gap at either end.
  "[&>:first-child]:mt-0! [&>:last-child]:mb-0!",
].join(" ");
