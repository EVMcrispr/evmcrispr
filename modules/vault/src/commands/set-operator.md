---
title: "vault:set-operator"
---

Approve (default) or revoke an operator on an ERC-7540 vault. Operators can request and claim on behalf of the connected account.

## Syntax

```evml
vault:set-operator <operator> <on> <vault> [approved]
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `operator` | `address` | Operator account to approve or revoke |
| `on` | `command` | Keyword `on` |
| `vault` | `address` | ERC-7540 vault address |
| `[approved]` | `bool` | Pass `false` to revoke the operator (defaults to `true`) |

## Examples

```evml
# Approve an operator to request and claim on your behalf on the Centrifuge JTRSY vault
load vault

switch mainnet
vault:set-operator 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 on 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A

# Revoke the same operator with a trailing `false`
load vault

switch mainnet
vault:set-operator 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 on 0xFE6920eB6C421f1179cA8c8d4170530CDBdfd77A false
```

<!-- HAND-WRITTEN -->

## Notes

Operators are ERC-7540's delegation mechanism: an approved operator can call `requestDeposit`, `requestRedeem` and the claim functions on behalf of the approving account. Approval is per-vault, not global.

## See Also

- [vault:request-deposit](./request-deposit.md)
- [vault:claim-deposit](./claim-deposit.md)
- [@vault:isOperator](../helpers/isOperator.md)
