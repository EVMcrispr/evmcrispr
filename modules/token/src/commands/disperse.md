---
title: "token:disperse"
---

Transfer a token to multiple recipients, encoding one transfer per recipient.

## Syntax

```evml
token:disperse <token> <recipients> <amounts>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `token` | `address` | Token address |
| `recipients` | `array` | Recipient addresses |
| `amounts` | `array \| number` | Per-recipient amounts in token units (wei), or a single amount sent to every recipient |

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
