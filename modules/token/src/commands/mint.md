---
title: "token:mint"
---

Mint tokens to an account. Calls the mint(address,uint256) function commonly exposed by OpenZeppelin-based ERC20 tokens (usually role- or owner-gated).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
token:mint <amount> <token> <to> <account>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `amount` | `number` | Runtime in smart blocks | Amount in token units (wei) |
| `token` | `address` | Runtime in smart blocks | Token address |
| `to` | `command` | Build time | Keyword `to` |
| `account` | `address` | Runtime in smart blocks | Recipient |

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

- [acl:grant](../../../acl/src/commands/grant.md) — grant MINTER_ROLE first
- [token:burn](burn.md)
