---
title: "superfluid:claim"
---

Claim all accrued earnings from a GDA pool without connecting to it. Anyone can trigger the claim; the tokens always go to the member.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:claim <from> <pool>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `from` | `command` | Build time | Keyword `from` |
| `pool` | `address` | Runtime in smart blocks | GDA pool address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--for` | `address` | Runtime in smart blocks | Member to claim for (defaults to the connected account) |

## Examples

```evml
# Claim a member's accrued pool earnings without connecting them
superfluid:create-pool $rewards xDAIx
superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $rewards
superfluid:claim from $rewards --for 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## See Also
