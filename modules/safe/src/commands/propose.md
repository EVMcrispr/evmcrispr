---
title: "safe:propose"
---

Propose a transaction to the Safe queue through the Safe Transaction Service, signed by the connected owner or delegate.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
safe:propose <safe> <block>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `safe` | `address` | Safe address |
| `block` | `block` | Commands composing the proposed transaction |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--nonce` | `number` | Safe nonce override (defaults to the next free nonce) |
| `--origin` | `string` | Origin tag shown in the Safe UI |

<!-- HAND-WRITTEN -->

## Examples

Propose a token transfer to the Safe queue:

```evml
load safe

set $receiver 0x4F2083f5fBede34C2714aFfb3105539775f7FE64
safe:propose @ens(mysafe.eth) (
  exec @token(DAI) transfer(address,uint256) $receiver 100e18
)
```

Batch several actions into one proposal (packed through MultiSendCallOnly) and
manage the Safe itself from inside the block:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $spender 0x4F2083f5fBede34C2714aFfb3105539775f7FE64

safe:propose $mySafe (
  exec @token(DAI) approve(address,uint256) $spender 100e18
  safe:add-owner 0x64c007ba4ab6184753dc1e8e7263e8d06831c5f6 --threshold 2
) --origin "My app"
```

The connected account must be an owner (or registered delegate) of the Safe;
it signs the EIP-712 SafeTx hash and the proposal appears in the Safe web UI
queue for the remaining confirmations. Set `$safe:apiKey` to lift the
anonymous rate limits of the Safe Transaction Service, or `$safe:serviceUrl`
to target a self-hosted service.

## See Also
