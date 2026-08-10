---
title: "@lending:healthFactor"
---

Health factor of an account's lending position: below 1 the position is liquidatable, and an account with no debt reads as effectively unbounded. Compare it directly, as in `>= 1.5`.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@lending:healthFactor(account adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Account to inspect |
| `[adapter]` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Print the health factor (below 1 is liquidatable)
print "Health factor:" @lending:healthFactor(@me)
```

<!-- HAND-WRITTEN -->

## On-chain face (@healthFactor!)

Reads the account data at assertion time and takes the health factor out
of it, so a batch that borrows can check what it left behind rather than
what it started from.

The value is wad-scaled by the protocol, and the face says so, which is
what lets `>= 1.5` mean one and a half. Comparing against `1.5e18` would
now be off by eighteen orders of magnitude — that spelling belongs to
the older raw-integer contract and no longer applies to either face.

Only Aave-style markets answer: Comet exposes `isBorrowCollateralized`
rather than a ratio, so it omits the slot and the face names it.
## See Also
