---
title: "vault:set-operator"
---

Approve (default) or revoke an operator on an ERC-7540 vault. Operators can request and claim on behalf of the connected account.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
vault:set-operator <operator> <on> <vault> [approved]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `operator` | `address` | Runtime in smart blocks | Operator account to approve or revoke |
| `on` | `command` | Build time | Keyword `on` |
| `vault` | `address` | Build time | ERC-7540 vault address |
| `[approved]` | `bool` | Runtime in smart blocks | Pass `false` to revoke the operator (defaults to `true`) |

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
