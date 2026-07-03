---
title: "token:mint"
---

Mint tokens to an account. Calls the mint(address,uint256) function commonly exposed by OpenZeppelin-based ERC20 tokens (usually role- or owner-gated).

## Syntax

```evml
token:mint <token> <to> <amount>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address |
| `to` | `address` | Recipient |
| `amount` | `number` | Amount in token units (wei) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

token:mint $token @me 100e18
```

## Notes

- `mint(address,uint256)` is not part of the ERC20 standard — it exists only
  where the contract exposes it (OpenZeppelin Wizard-style tokens), usually
  gated by MINTER_ROLE or the owner.

## See Also

- [access-control:grant](../../../access-control/src/commands/grant.md) — grant MINTER_ROLE first
- [token:burn](burn.md)
