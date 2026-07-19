---
title: "superfluid:stop-vesting"
---

Delete a pending vesting schedule, or end a running one immediately with --now true (the receiver keeps what has vested so far).

## Syntax

```evml
superfluid:stop-vesting <token> <to> <receiver>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `supertoken` | SuperToken symbol (e.g. USDCx) or address |
| `to` | `command` | Keyword `to` |
| `receiver` | `address` | Vesting receiver |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--now` | `bool` | End a running schedule immediately instead of deleting a pending one |

## Examples

```evml
# Cancel a contributor's vesting before it starts
superfluid:stop-vesting xDAIx to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71
```

<!-- HAND-WRITTEN -->

## See Also
