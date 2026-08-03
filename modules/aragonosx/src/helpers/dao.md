---
title: "@aragonosx:dao"
---

Resolve the connected DAO to its address.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

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
