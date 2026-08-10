---
title: "@receipts:tx.gasPrice!"
---

Gas price of the executing transaction, in wei.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:tx.gasPrice!
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load receipts

# Refuse to execute when gas is expensive
assert @tx.gasPrice! <= 50e9 "gas too pricey"
```

## See Also

- [@receipts:block.baseFee!](block.baseFee.md) — the block base fee in wei
