---
title: "@lang:str.join"
---

Join array elements into a string with a delimiter.

**On-chain (`@lang:str.join!`)**: At most one element may be a live call; the rest must be string constants.

**Returns**: `string`

## Syntax

```evml
@lang:str.join(arr delim)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `delim` | `string` | Delimiter string |

<!-- HAND-WRITTEN -->

## See Also

- [@str.split](str.split.md) — split a string into an array
- [@str.concat](str.concat.md) — concatenate strings

## On-chain face (@str.join!)

Join parts with a delimiter through a SINGLE `concat` call — there is
no join function on-chain. The delimiter interleaves between the parts
at composition time, and constant runs (part, delimiter, part, …)
merge into one constant concat part, so `["v" $reg::version()]` with
`"."` compiles to `concat(["v.", <live>])`. The parts list is an array
literal of constant strings plus AT MOST ONE live call part: the live
envelope splices into the calldata last, but may sit at any logical
position in the list (its ABI offset points at the splice).

### Examples

```evml
load assertions
load lang

set $reg 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @str.join!(["v" $reg::{version()(string)}] ".") == "v.2"
```

### Notes

- One live part maximum: a second live part's offset would depend on
  the first's runtime length.
- An empty delimiter concatenates the parts.

### See Also

- `assertions:assert`, `@str.split!`, `@bytes.concat!`
