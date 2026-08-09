---
title: "@receipts:tx.gasprice!"
---

The gas price of the executing transaction in wei, read on-chain at execution time: bound what the batch is willing to pay, e.g. @tx.gasprice! <= 50e9.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:tx.gasprice!
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions
load receipts

# Refuse to execute when gas is expensive
assertions:assert @tx.gasprice! <= 50e9 "gas too pricey"
```

## See Also

- [@receipts:block.basefee!](block.basefee.md) — the block base fee in wei
