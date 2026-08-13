---
title: "@lending:maxBorrow"
---

How much of a token an account can still borrow against its current collateral, in base units of the token.

**On-chain (`@lending:maxBorrow!`)**: Aave-style markets only — CompoundV3 prices collateral by walking every listed asset, which has no on-chain form; a zero oracle price reads as 0.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@lending:maxBorrow(account token adapter?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `account` | `address` | Account to inspect |
| `token` | `address` | Token to borrow (use @token(SYM)) |
| `[adapter]` | `lending-adapter` | Lending protocol: AaveV3, Spark or CompoundV3 (default: the best available on the chain) |

## Examples

```evml
# Print how much WXDAI the connected account can still borrow
print "Can still borrow:" @lending:maxBorrow(@me 0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d)
```

<!-- HAND-WRITTEN -->

## On-chain face (@lending:maxBorrow!)

Aave-style markets express the read as `availableBorrowsBase ×
10^decimals ÷ oracle price` — the headroom (word 2 of
`getUserAccountData`) and the price are live reads, the token's decimals
are pinned at composition (the token is a constant), and the division is
one 512-bit mul-div so zero headroom reads 0 with no branch. A zero
oracle price also reads 0, matching the plain face, instead of reverting
the judge on the division.

CompoundV3 refuses: Comet prices collateral by walking every listed
asset, and a loop has no composition at any node count. The error says
so and points at `--using` with a protocol that can.

## See Also
