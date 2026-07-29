---
title: "token:permit"
---

Approve a spender through an EIP-2612 permit signed by the connected wallet, encoded as a permit() call anyone can submit.

## Syntax

```evml
token:permit <amount> <token> <for> <spender>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `amount` | `number` | Allowance in token units (wei) |
| `token` | `address` | Token address |
| `for` | `command` | Keyword `for` |
| `spender` | `address` | Spender address |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--deadline` | `number` | Permit expiry as a Unix timestamp (defaults to no expiry) |

<!-- HAND-WRITTEN -->

The command reads the token nonce and EIP-712 domain, asks the connected
wallet for a typed-data signature, and encodes the resulting
`permit(owner, spender, value, deadline, v, r, s)` call. The signature only
covers the connected account as owner, so the encoded call can be submitted
by anyone — including inside a batch executed by another account.

Only standard EIP-2612 permits are supported; tokens with nonstandard permit
signatures (e.g. DAI-style `allowed` permits) are rejected.

## Examples

```evml
load token

set $token 0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb
set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

# Approve via signature instead of an approve transaction
token:permit 100e18 $token for $spender

# Permit that expires in one day
token:permit 100e18 $token for $spender --deadline @date(now +1d)
```

## See Also

- [token:approve](approve.md) — transaction-based approval
- [sign](../../../std/src/commands/sign.md) — sign arbitrary messages or typed data
