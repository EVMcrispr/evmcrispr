---
title: "@assertions:chainid"
---

The chain id. Unlike assert-chainid it composes into expressions.

**Returns**: `number`

## Syntax

```evml
@assertions:chainid
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

assertions:assert @chainid! == 100 "wrong chain"
```

## See Also

- [assertions:assert-chainid](../commands/assert-chainid.md), [@receipts:block.timestamp!](../../../receipts/src/helpers/block.timestamp.md), [@receipts:block.number!](../../../receipts/src/helpers/block.number.md)
