---
title: "@assertions:len!"
---

The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes.

**Returns**: `number`

## Syntax

```evml
@assertions:len!(call)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `address` | A `::` call expression (or chain) returning an array, string or bytes |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# Top level: compiles to the core assert*CallArrayLength family (all six operators)
assertions:assert @len!($gov::{voters()(address[])}) >= 3 "not enough voters"
assertions:assert @len!($gov::{voters()(address[])}) != 0

# Nested: compiles to Combinators.arrayLengthCall, composable as a number
assertions:assert @num!(@len!($gov::{voters()(address[])}) * 2) > 4
```

## Notes

- For a string/bytes return the decoded length is the byte length (UTF-8
  characters may span multiple bytes). For raw returndata size use
  [@assertions:bytelen!](bytelen-bang.md).

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:bytelen!](bytelen-bang.md)
