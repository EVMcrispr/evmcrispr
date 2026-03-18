---
title: "giveth:donate"
---

Send a donation to a Giveth project.

## Syntax

```evml
giveth:donate <slug> <amount> <tokenAddr>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `slug` | `string` |  |
| `amount` | `number` | Donation amount in token base units |
| `tokenAddr` | `address` | Payment token address |

## Examples

```evml
# Donate to a Giveth project
set $token.tokenlist https://tokens.honeyswap.org
giveth:donate evmcrispr @token.amount(HNY 1) @token(HNY)
```

<!-- HAND-WRITTEN -->

## See Also

- [@giveth:projectAddr](../helpers/projectAddr.md) — resolve project address
