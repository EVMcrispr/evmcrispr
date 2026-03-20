import { ErrorException, Num, defineHelper } from "@evmcrispr/sdk";
import type { Param } from "@evmcrispr/sdk";
import type Http from "..";

const WILDCARD = Symbol("*");
type Segment = string | number | typeof WILDCARD;

function parsePath(path: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") {
      i++;
      continue;
    }
    if (path[i] === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) throw new ErrorException("@json: unclosed bracket in path");
      const inner = path.slice(i + 1, close).trim();
      if (inner === "*") {
        segments.push(WILDCARD);
      } else {
        const idx = Number(inner);
        if (!Number.isInteger(idx)) {
          throw new ErrorException(`@json: invalid index "${inner}" in path`);
        }
        segments.push(idx);
      }
      i = close + 1;
      continue;
    }
    if (path[i] === "*") {
      segments.push(WILDCARD);
      i++;
      continue;
    }
    let end = i;
    while (end < path.length && path[end] !== "." && path[end] !== "[" && path[end] !== "*") end++;
    if (end > i) segments.push(path.slice(i, end));
    i = end;
  }
  return segments;
}

function resolve(current: unknown, segments: Segment[], from: number): unknown {
  for (let i = from; i < segments.length; i++) {
    const seg = segments[i];

    if (seg === WILDCARD) {
      if (!Array.isArray(current)) {
        throw new ErrorException("@json: wildcard [*] requires an array");
      }
      return current.map((item) => resolve(item, segments, i + 1));
    }

    if (current == null) {
      throw new ErrorException(
        `@json: cannot access "${String(seg)}" on ${current}`,
      );
    }
    if (typeof seg === "number" && seg < 0 && Array.isArray(current)) {
      current = (current as any[])[current.length + seg];
    } else {
      current = (current as any)[seg];
    }
  }
  return current;
}

function navigatePath(obj: unknown, path: string): unknown {
  const normalized = path.startsWith("$.") ? path.slice(2) : path;
  return resolve(obj, parsePath(normalized), 0);
}

export function toParam(value: unknown): Param {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "null";
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return Num.fromBigInt(BigInt(value));
    }
    return Num.fromDecimalString(value.toString());
  }
  if (typeof value === "bigint") return Num.fromBigInt(value);
  if (Array.isArray(value)) return value.map(toParam);
  return JSON.stringify(value);
}

export default defineHelper<Http>({
  name: "json",
  description: "Parse a JSON string and extract a value by path.",
  returnType: "any",
  args: [
    { name: "data", type: "string", description: "JSON string to parse" },
    { name: "path", type: "json-path", description: "JSONPath expression (e.g. `data.items[0].name`)" },
  ],
  async run(_, { data, path }) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      throw new ErrorException("@json: invalid JSON input");
    }

    const result = navigatePath(parsed, String(path));

    if (result === undefined) {
      throw new ErrorException(
        `@json: path "${path}" resolved to undefined`,
      );
    }

    return toParam(result);
  },
});
