---
title: "@balance"
---

Fetch a balance in base units: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address. As @balance! the balance is read on-chain at assertion time instead of script build time.

**Returns**: `number`

## Syntax

```evml
@balance(token holder)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `token-symbol` | ETH (native) or a token symbol/address resolved like @token |
| `holder` | `address` | Account address, or (@balance! with native ETH only) a `::` call resolving to one |

## Examples

```evml
# Query a token balance
set $bal @balance(DAI @token(DAI))
```

<!-- HAND-WRITTEN -->

## See Also

- [@token](../../../std/src/helpers/token.md) — resolve a token symbol to its address
- [@token:amount](../../../token/src/helpers/amount.md) — convert to base units
- [@token:format](../../../token/src/helpers/format.md) — format base units as a human-readable string
- [@get](../../../std/src/helpers/get.md) — generic contract reads

## On-chain face (@balance!)

Read a balance on-chain at assertion time: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address.

#
