import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

const cell = (value: any): string =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");

function tableMarkdown(headerCells: string[], rows: any[][]): string {
  return [
    `| ${headerCells.join(" | ")} |`,
    `| ${headerCells.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

function renderColumnsTable(headers: any[], values: any[]): string {
  // A single array-of-arrays value holds the columns; otherwise each
  // printed value is one column.
  const columns =
    values.length === 1 &&
    Array.isArray(values[0]) &&
    (values[0] as any[]).every(Array.isArray)
      ? (values[0] as any[][])
      : (values as any[][]);

  if (!columns.every(Array.isArray)) {
    throw new ErrorException("--headers expects an array per column");
  }
  if (headers.length !== columns.length) {
    throw new ErrorException(
      `--headers names ${headers.length} column${headers.length === 1 ? "" : "s"} but ${columns.length} ${columns.length === 1 ? "was" : "were"} printed`,
    );
  }

  const rowCount = Math.max(0, ...columns.map((c) => c.length));
  const rows = Array.from({ length: rowCount }, (_, row) =>
    columns.map((c) => c[row]),
  );
  return tableMarkdown(headers.map(cell), rows);
}

// A bare array prints as a headerless table: 1-D as a single row, an
// array of arrays as one row per inner array. The all-empty header row
// GFM requires is hidden by the terminal's CSS.
function renderRowsTable(value: any[]): string {
  const rows =
    value.length > 0 && value.every(Array.isArray)
      ? (value as any[][])
      : [value];
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  if (colCount === 0) return "";
  const padded = rows.map((row) =>
    Array.from({ length: colCount }, (_, i) => row[i]),
  );
  return tableMarkdown(Array(colCount).fill(""), padded);
}

export default defineCommand<Std>({
  name: "print",
  description:
    "Log values to the console output. Arrays render as headerless tables: a flat array as one row, an array of arrays as one row per inner array.",
  args: [
    {
      name: "values",
      type: "any",
      rest: true,
      description: "Values to output, space-separated",
    },
  ],
  opts: [
    {
      name: "headers",
      type: "array",
      description:
        "Column headers; renders the printed arrays as a table, one array per column",
    },
  ],
  async run(module, { values }, { opts }) {
    if (opts.headers !== undefined) {
      module.context.log(renderColumnsTable(opts.headers, values as any[]));
      return;
    }
    const segments: string[] = [];
    let buffer = "";
    const flush = () => {
      if (buffer !== "") {
        segments.push(buffer);
        buffer = "";
      }
    };
    for (const value of values as any[]) {
      if (Array.isArray(value)) {
        flush();
        const table = renderRowsTable(value);
        if (table !== "") segments.push(table);
      } else {
        buffer += value ?? "";
      }
    }
    flush();
    // Blank lines between segments: GFM tables don't interrupt paragraphs.
    module.context.log(segments.join("\n\n"));
  },
});
