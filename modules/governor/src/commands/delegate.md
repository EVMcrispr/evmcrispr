---
title: "governor:delegate"
---

Delegate the voting power the connected account holds in an ERC20Votes/ERC721Votes token.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
governor:delegate <token> <to> <delegatee>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `address` | Runtime in smart blocks | Votes token address |
| `to` | `command` | Build time | Keyword `to` |
| `delegatee` | `address` | Runtime in smart blocks | Account receiving the voting power |

<!-- HAND-WRITTEN -->

## Examples

```evml
load governor

# Self-delegate to activate your own voting power
governor:delegate 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72 to @me

# Or delegate to a steward
governor:delegate 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72 to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
```

## Notes

- ERC20Votes balances carry no voting power until delegated — delegate to
  yourself to vote with your own tokens.

## See Also

- [governor:vote](vote.md) — cast votes with the delegated power
