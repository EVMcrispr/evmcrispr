---
title: "@superfluid:token"
---

Resolve a SuperToken from the Superfluid token list: by SuperToken symbol (USDCx), or by underlying token address (the USDC address returns USDCx).

**On-chain (`@superfluid:token!`)**: The token list is off-chain, so the resolved address folds in as a constant; pair it with `@underlying!` for a live check.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@superfluid:token(symbolOrUnderlying)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `symbolOrUnderlying` | `supertoken` | SuperToken symbol, or the address of the underlying token |

## Examples

```evml
# Resolve USDCx from the USDC address and print both
set $usdcx @superfluid:token(0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83)
print "USDCx:" $usdcx
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@token!)

The token list is an off-chain service, so resolution still happens at
composition time; the resolved SuperToken address folds into the
on-chain expression as a build-time constant. Pair it with
`@underlying!` for a live check that the wrapper still points at the
expected ERC-20.

#
