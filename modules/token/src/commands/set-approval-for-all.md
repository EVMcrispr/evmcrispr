---
title: "token:set-approval-for-all"
---

Approve or revoke an operator for all ERC721 or ERC1155 tokens of the connected account.

## Syntax

```evml
token:set-approval-for-all <token> <operator> <approved>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address |
| `operator` | `address` | Operator address |
| `approved` | `bool` | true to approve, false to revoke |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $nft 0x22C1f6050E56d2876009903609a2cC3fEf83B415
set $operator 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

token:set-approval-for-all $nft $operator true

# Revoke the operator
token:set-approval-for-all $nft $operator false
```

## Notes

- Applies to all current and future ERC721 / ERC1155 tokens the connected
  account holds in the contract.
