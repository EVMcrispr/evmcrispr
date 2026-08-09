---
title: "@lang:bytes.concat"
---

Concatenate bytes values together. As @bytes.concat! the parts concatenate on-chain through Operators.concat — constant hex parts plus at most one live call part (spliced into the calldata last, at any argument position).

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.concat(first ...rest)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `first` | `bytes` | First bytes value (in @bytes.concat! a hex constant or a `::` call returning bytes/string) |
| `[...rest]` | `bytes` | Bytes values to append |

<!-- HAND-WRITTEN -->

## See Also

- [@concat](concat.md) — concatenate arrays
- [@str.concat](str.concat.md) — concatenate strings

## On-chain face (@bytes.concat!)

Concatenate bytes values on-chain through `Operators.concat`: constant
hex parts plus AT MOST ONE live call part (spliced into the calldata
last, at any argument position).

### Examples

```evml
load assertions
load lang

set $oracle 0x44fA8E6f47987339850636F88629646662444217

assertions:assert @bytes.concat!(0x1234 $oracle::{blob()(bytes)}) == 0xabcd
```

### See Also

- `assertions:assert`, `@str.join!`, `@concat!`
