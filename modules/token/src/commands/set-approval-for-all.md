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

token:set-approval-for-all $nft $operator true

# Revoke the operator
token:set-approval-for-all $nft $operator false
```

## Notes

- Applies to all current and future ERC721 / ERC1155 tokens the connected
  account holds in the contract.
