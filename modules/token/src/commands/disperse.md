---
title: "token:disperse"
---

Transfer a token to multiple recipients, encoding one transfer per recipient.

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
token:disperse <token> <recipients> <amounts>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `token` | `address` | Runtime in smart blocks | Token address |
| `recipients` | `array` | Runtime in smart blocks | Recipient addresses |
| `amounts` | `array \| number` | Runtime in smart blocks | Per-recipient amounts in token units (wei), or a single amount sent to every recipient |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--max-recipients` | `number` | Build time | Maximum recipients for a runtime array (default 32, at most 256); exceeding it reverts the batch |

<!-- HAND-WRITTEN -->

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $alice 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
set $bob 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6

# Pay each recipient its own amount
token:disperse $token [$alice $bob] [100e18 50e18]

# Send the same amount to every recipient
token:disperse $token [$alice $bob] 10e18
```

## See Also

- [token:transfer](transfer.md)
- [loop](../../../std/src/commands/loop.md) — for payouts that need per-recipient logic
