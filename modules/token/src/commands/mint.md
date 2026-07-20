---
title: "token:mint"
---

Mint tokens to an account. Calls the mint(address,uint256) function commonly exposed by OpenZeppelin-based ERC20 tokens (usually role- or owner-gated).

## Syntax

```evml
token:mint <amount> <token> <to> <account>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Amount in token units (wei) |
| `token` | `address` | Token address |
| `to` | `command` | Keyword `to` |
| `account` | `address` | Recipient |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
token:mint 100e18 $token to @me
```

## Notes

- `mint(address,uint256)` is not part of the ERC20 standard — it exists only
  where the contract exposes it (OpenZeppelin Wizard-style tokens), usually
  gated by MINTER_ROLE or the owner.

## See Also

- [access-control:grant](../../../access-control/src/commands/grant.md) — grant MINTER_ROLE first
- [token:burn](burn.md)
