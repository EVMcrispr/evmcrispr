---
title: "@superfluid:token"
---

Resolve a SuperToken from the Superfluid token list: by SuperToken symbol (USDCx), or by underlying token address (the USDC address returns USDCx).

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

## No on-chain face

There is deliberately no `@token!`. The token list is an off-chain service, so
resolution can only happen at composition time — a `!` face would have done
exactly what this one does and then handed back a constant, which is a face
that claims to evaluate on-chain and does not.

Nothing is lost. A plain helper folds into an on-chain expression as a
build-time constant, so the nesting still works, just without the bang:

```evml
load assertions
load superfluid

# The wrapper still points at the ERC-20 we expect
assertions:assert @superfluid:underlying!(@superfluid:token(USDCx)) == 0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83
```

`@underlying!` is the live part: it reads the SuperToken at assertion time, so
the assertion still fails if the wrapper is repointed. The address the token
list resolved is fixed when the script is built, which is the honest reading of
what an off-chain lookup can promise.
