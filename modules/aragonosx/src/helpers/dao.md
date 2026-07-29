---
title: "@aragonosx:dao"
---

Resolve the connected DAO to its address.

**Returns**: `address`

## Syntax

```evml
@aragonosx:dao
```

## Examples

```evml
# Use the DAO address inside a proposal action
aragonosx:connect 0x2222222222222222222222222222222222222222 (
  set $treasury @aragonosx:dao()
  print $treasury
)
```

<!-- HAND-WRITTEN -->

## See Also
