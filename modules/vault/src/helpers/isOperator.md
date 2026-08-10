---
title: "@vault:isOperator"
---

Whether an account is an approved operator of a controller on an ERC-7540 vault.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `bool`

## Syntax

```evml
@vault:isOperator(vault operator controller?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `vault` | `address` | ERC-7540 vault address |
| `operator` | `address` | Operator account to check |
| `[controller]` | `address` | Controller the operator would act for (defaults to the connected account) |

## Examples

```evml
# Check whether an account can request and claim on your behalf
load vault

switch mainnet
print "operator:" @vault:isOperator(0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A 0x4F2083f5fBede34C2714aFfb3105539775f7FE64)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@isOperator!)

Read isOperator(controller, operator) at assertion time — assert a
batch's operator approval landed (or was revoked).

#
