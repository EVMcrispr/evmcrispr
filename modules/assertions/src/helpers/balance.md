---
title: "@assertions:balance!"
---

Read a balance on-chain at assertion time: the native balance for ETH, or an ERC-20 balanceOf for any token symbol or address.

**Returns**: `number`

## Syntax

```evml
@assertions:balance!(token account)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `any` | ETH (native) or a token symbol/address resolved like @token |
| `account` | `any` | Account address, or (native only) a `::` call resolving to one |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

# Native balance at assertion time
assertions:assert @balance!(ETH @me) > 1e18

# Token symbols resolve like @token; addresses work too
assertions:assert @balance!(WETH @me) >= 10e18
assertions:assert @balance!(0x6B175474E89094C44Da98b954EedeAC495271d0F @me) >= 10e18

# Native balance of a call-resolved account (ethBalanceCall)
set $registry 0x0102030405060708090a0b0c0d0e0f1011121314
assertions:assert @balance!(ETH $registry::{treasury()(address)}) >= 100e18
```

## Notes

- The token argument resolves off-chain at build time (same path as
  `@token`); the balance itself is read on-chain at assertion time.
- A call-resolved account is only supported for the native token — the
  combinators contract cannot route a resolved address into `balanceOf`.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:num!](num.md)
