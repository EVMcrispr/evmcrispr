---
title: "@assertions:blockhash!"
---

The hash of a block, read at assertion time (0 for the current block, the future, and blocks older than 256). Compose the number live, e.g. @blockhash!(@blocknumber! - 1).

**Returns**: `bytes32`

## Syntax

```evml
@assertions:blockhash!(...block)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[...block]` | `number` | Block number: a constant or an infix expression |

<!-- HAND-WRITTEN -->

## Examples

```evml
# TODO: add examples
```

## See Also
