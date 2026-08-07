---
title: "@assertions:chainid!"
---

The chain id at assertion time, read on-chain — unlike assert-chainid it composes into expressions.

**Returns**: `number`

## Syntax

```evml
@assertions:chainid!
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

assertions:assert @chainid! == 100 "wrong chain"
```

## See Also

- [assertions:assert-chainid](../commands/assert-chainid.md), [@assertions:timestamp!](timestamp-bang.md), [@assertions:blocknumber!](blocknumber-bang.md)
