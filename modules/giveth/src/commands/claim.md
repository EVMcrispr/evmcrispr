---
title: "giveth:claim"
---

Harvest GIV rewards: collect the accrued GIVpower staking rewards into the GIVstream (when the chain has a staking contract) and claim the GIV the GIVstream has already released.

## Syntax

```evml
giveth:claim
```

<!-- HAND-WRITTEN -->

## Examples

```evml
load giveth

giveth:claim
```

The command reads your position first: it appends a `getReward()` call only
when staking rewards have accrued, and a `TokenDistro.claim()` only when the
GIVstream has released something — and errors with "nothing to claim" when
both are empty. Staking rewards do not arrive as liquid GIV: harvesting
assigns them to your GIVstream, which releases them gradually until December
2026.

## See Also

- [@giveth:claimable](../helpers/claimable.md)
- [giveth:stake](stake.md)
