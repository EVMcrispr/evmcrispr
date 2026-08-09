---
title: "@assertions:chainid"
---

The chain id: read at script build time as @chainid, on-chain at assertion time as @chainid! — unlike assert-chainid both compose into expressions.

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

- [assertions:assert-chainid](../commands/assert-chainid.md), [@assertions:timestamp!](timestamp.md), [@assertions:blocknumber!](blocknumber.md)
