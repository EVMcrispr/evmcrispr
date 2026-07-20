import { defineCommand, ErrorException } from "@evmcrispr/sdk";
import type Std from "..";

const cell = (value: any): string =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");

function renderTable(headers: any[], values: any[]): string {
  // A single array-of-arrays value holds the columns; otherwise each
  // printed value is one column.
  const columns =
    values.length === 1 &&
    Array.isArray(values[0]) &&
    (values[0] as any[]).every(Array.isArray)
      ? (values[0] as any[][])
      : (values as any[][]);

  if (!columns.every(Array.isArray)) {
    throw new ErrorException("--table expects an array per column");
  }
  if (headers.length !== columns.length) {
    throw new ErrorException(
      `--table names ${headers.length} column${headers.length === 1 ? "" : "s"} but ${columns.length} ${columns.length === 1 ? "was" : "were"} printed`,
    );
  }

  const rowCount = Math.max(0, ...columns.map((c) => c.length));
  const lines = [
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];
  for (let row = 0; row < rowCount; row++) {
    lines.push(`| ${columns.map((c) => cell(c[row])).join(" | ")} |`);
  }
  return lines.join("\n");
}

export default defineCommand<Std>({
  name: "print",
  description: "Log values to the console output.",
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
      name: "table",
      type: "array",
      description:
        "Column headers; renders the printed arrays as a table, one array per column",
    },
  ],
  async run(module, { values }, { opts }) {
    if (opts.table !== undefined) {
      module.context.log(renderTable(opts.table, values as any[]));
      return;
    }
    const varValue = (values as any[]).join("");
    module.context.log(varValue);
  },
});
