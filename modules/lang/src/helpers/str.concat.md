---
title: "@lang:str.concat"
---

Concatenate strings together. As @str.concat! the parts concatenate on-chain through Operators.concat — constant strings plus at most one live call part (spliced into the calldata last, at any argument position).

**Returns**: `string`

## Syntax

```evml
@lang:str.concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `string` | First string segment (in @str.concat! a string constant or a `::` call returning string/bytes) |
| `[...rest]` | `string` | Strings to append |

<!-- HAND-WRITTEN -->

## See Also

- [@str.join](str.join.md) — join array elements with a delimiter
- [@concat](concat.md) — concatenate arrays

## On-chain face (@str.concat!)

Concatenate the parts on-chain through a single `concat` call: the
@bytes.concat! compile body with the String category. Constant string
parts plus AT MOST ONE live call part — the live envelope splices into
the calldata last, but may sit at any argument position (its ABI
offset points at the splice).

### Examples

```evml
load assertions
load lang

set $reg 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @str.concat!("v" $reg::{version()(string)}) == "v2"
```

### Notes

- One live part maximum: a second live part's offset would depend on
  the first's runtime length.
- For a delimiter between the parts use `@str.join!` — it compiles to
  the same single concat with the delimiter interleaved at composition
  time.

### See Also

- `assertions:assert`, `@str.join!`, `@bytes.concat!`
