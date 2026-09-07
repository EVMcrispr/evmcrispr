---
title: "@lang:flat"
---

Flatten one level of nesting in an array.

**On-chain (`@lang:flat!`)**: Flattens runtime nested arrays or a literal list of compatible array parts, preserving element types.

**Returns**: `array`

## Syntax

```evml
@lang:flat(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array of arrays |

<!-- HAND-WRITTEN -->

## See Also

- [@concat](concat.md) — concatenate arrays
- [@map](map.md) — transform then flatten with `@flat(@map(...))`

## On-chain face (@flat!)

Flatten arrays by one level while preserving element order and type. Constant and live parts can be mixed, and any number may be live: the core gathers each one once into the values list.

Literal parts also support strings, bytes, tuples, and nested arrays. When mixed
with a live typed array, literals inherit its element type; otherwise all literal
parts are inferred together. Empty parts inherit their siblings' type, with
`uint256[]` as the fallback when every part is empty.
