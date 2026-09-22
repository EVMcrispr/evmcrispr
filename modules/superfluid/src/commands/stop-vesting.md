---
title: "superfluid:stop-vesting"
---

Delete a pending vesting schedule, or end a running one immediately with --now true (the receiver keeps what has vested so far).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
superfluid:stop-vesting <token> <to> <receiver>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `supertoken` | Build time | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Build time | Keyword `to` |
| `receiver` | `address` | Runtime in smart blocks | Vesting receiver |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--now` | `bool` | Build time | End a running schedule immediately instead of deleting a pending one |

## Examples

```evml
# Cancel a contributor's vesting before it starts
superfluid:stop-vesting xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## See Also
