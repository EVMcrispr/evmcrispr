import { defineHelper, ErrorException, type Param } from "@evmcrispr/sdk";
import type Lang from "..";

export default defineHelper<Lang>({
  name: "lookup",
  description:
    "Look up an entry by name in a record (`[a:1 b:2]` or `[name value]` pairs).",
  returnType: "any",
  args: [
    {
      name: "record",
      type: "record",
      description: "Record (entries array) to look the name up in",
    },
    { name: "name", type: "string", description: "Entry name to look up" },
  ],
  async run(_, { record, name }) {
    const key = String(name);
    const entry = (record as [string, Param][]).find(
      ([entryName]) => String(entryName) === key,
    );
    if (!entry) {
      const known = (record as [string, Param][])
        .map(([entryName]) => String(entryName))
        .join(", ");
      throw new ErrorException(
        `@lookup: no entry named "${key}"${known ? ` — record has: ${known}` : " — record is empty"}`,
      );
    }
    return entry[1];
  },
});
