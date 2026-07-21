---
title: "giveth:claim"
---

Harvest GIV rewards: collect the accrued GIVpower staking rewards (when the chain has a staking contract) and claim the GIV the GIVstream has already released. Does nothing when there is nothing to claim.

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

The command reads your position first and emits at most one transaction —
and none when there is nothing to claim, so no `if` guard is needed. When
staking rewards have accrued it emits a single `getReward()`: harvesting
assigns the rewards to your GIVstream, and the GIVstream immediately pays
out everything it has released so far (the rest keeps streaming until
December 2026), so a separate `TokenDistro.claim()` would find nothing left
and revert. Only when no staking rewards are pending does the command claim
the released GIVstream balance directly.

## See Also

- [@giveth:claimable](../helpers/claimable.md)
- [giveth:stake](stake.md)
