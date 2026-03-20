import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type { Param } from "@evmcrispr/sdk";
import type Http from "..";

interface TemplateEntry {
  key: string;
  children?: TemplateEntry[];
}

function parseTemplate(src: string): TemplateEntry[] {
  const s = src.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) {
    throw new ErrorException(
      '@json.format: template must be wrapped in { }',
    );
  }
  return parseEntries(s.slice(1, -1));
}

function parseEntries(src: string): TemplateEntry[] {
  const entries: TemplateEntry[] = [];
  let i = 0;

  while (i < src.length) {
    while (i < src.length && (src[i] === " " || src[i] === ",")) i++;
    if (i >= src.length) break;

    let keyEnd = i;
    while (keyEnd < src.length && src[keyEnd] !== "," && src[keyEnd] !== ":" && src[keyEnd] !== " ") {
      keyEnd++;
    }
    const key = src.slice(i, keyEnd).trim();
    if (!key) break;
    i = keyEnd;

    while (i < src.length && src[i] === " ") i++;

    if (i < src.length && src[i] === ":") {
      i++;
      while (i < src.length && src[i] === " ") i++;
      if (i >= src.length || src[i] !== "{") {
        throw new ErrorException(
          `@json.format: expected '{' after "${key}:"`,
        );
      }
      const close = findMatchingBrace(src, i);
      const children = parseEntries(src.slice(i + 1, close));
      entries.push({ key, children });
      i = close + 1;
    } else {
      entries.push({ key });
    }
  }
  return entries;
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  if (depth !== 0) {
    throw new ErrorException("@json.format: unmatched '{' in template");
  }
  return i - 1;
}

function paramToJson(value: Param): unknown {
  if (value instanceof Num) {
    return value.isInteger()
      ? value.toNumber()
      : Number(value.num) / Number(value.den);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (Array.isArray(value)) return value.map(paramToJson);
  return value;
}

function buildObject(
  entries: TemplateEntry[],
  values: Param[],
): Record<string, unknown> {
  if (values.length < entries.length) {
    throw new ErrorException(
      `@json.format: expected ${entries.length} values but got ${values.length}`,
    );
  }

  const obj: Record<string, unknown> = {};
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const val = values[i];

    if (entry.children) {
      if (!Array.isArray(val)) {
        throw new ErrorException(
          `@json.format: value for nested key "${entry.key}" must be an array`,
        );
      }
      obj[entry.key] = buildObject(entry.children, val);
    } else {
      obj[entry.key] = paramToJson(val);
    }
  }
  return obj;
}

export default defineHelper<Http>({
  name: "json.format",
  description: "Construct a JSON string from a template and an array of values.",
  returnType: "string",
  args: [
    { name: "template", type: "string", description: "Brace-wrapped template listing JSON object keys" },
    { name: "values", type: "array", description: "Values to substitute into template" },
  ],
  async run(_, { template, values }) {
    const entries = parseTemplate(String(template));
    const obj = buildObject(entries, values);
    return JSON.stringify(obj);
  },
});
