---
title: "safe:propose"
---

Propose a signed transaction to the Safe queue, or prepare and sign portable transaction JSON with --no-api.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

Accepts ordinary `(...)` and smart `!(...)` payload blocks. Smart blocks support explicit `@helper!` expressions and returned-value captures.

## Syntax

```evml
safe:propose <safe> <block>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `safe` | `address` | Build time | Safe address |
| `block` | `block \| string` | Build time | Commands composing the transaction, or exported transaction JSON with --no-api |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--salt` | `bytes32` | Build time | Smart-batch storage salt for reproducible offline signing (block forms with !) |
| `--as` | `variable` | Build time | Bind the exported package to a variable (requires --no-api) |
| `--no-api` | `bool` | Build time | Export transaction JSON and collect signatures locally without contacting the Safe Transaction Service |
| `--unsigned` | `bool` | Build time | Prepare transaction JSON without a wallet signature (requires --no-api) |
| `--nonce` | `number` | Build time | Safe nonce override for a block (defaults to the next free service nonce, or the on-chain nonce with --no-api) |
| `--origin` | `string` | Build time | Origin tag shown in the Safe UI |

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

## Without the Safe API

Use `--no-api true` to print portable JSON instead of posting to the queue.
RPC access is still required. The nonce defaults to the Safe's current on-chain
nonce; use `--nonce` when coordinating a future transaction. Pending service
proposals are not consulted. Safe >=1.3.0 is supported; service delegates are not Safe owners.

Prepare a transaction without requesting a wallet signature:

```evml
load safe
set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee

safe:propose $mySafe (
  safe:change-threshold 2
) --no-api true --unsigned true --as $tx
```

The final log line is JSON containing `chainId`, `safe`, `tx`, `safeTxHash`, and
`signatures`, `version: 1`, and `kind: "transaction"`. Numeric transaction fields are decimal strings to preserve exact
values. Copy the complete JSON into a string variable `$tx` on each owner's
machine, then run:

```evml novalidate
safe:verify $mySafe $tx --no-api true
safe:propose $mySafe $tx --no-api true
```

Each call to `propose` prints new JSON with that owner's signature appended.
Pass this updated JSON to the next owner, and finally to `safe:execute`.
Omit `--unsigned true` on the initial block to prepare and sign in one step.
Imported payloads and EOA signatures are checked; current authorization is checked by verify and execute. Imported nonces cannot be overridden.
`--origin` applies only to service proposals and cannot be combined with
`--no-api true`.

The hashes printed by `verify` establish consistency, not trust in the payload:
review the target, calldata, value, and nonce before signing. Share the exported
payload rather than rebuilding a block whose helper reads might have changed.

This workflow follows the prepare/sign/execute separation in the
[Agglayer Safe multisig tools](https://github.com/agglayer/agglayer-contracts/tree/main/tools/safeMultisig).

## Composing with shared commands

Use `--as $tx` to bind the package instead of copying it from logs. Owners can
review, sign, and merge independently:

```evml novalidate
load http
safe:verify $mySafe $tx --no-api true --as $review
sign $signature --typed @http:json($review typedData)
set $signed @safe:merge($tx $signature)
print $signed
```

`--as` requires `--no-api true`. Contract owners use signed Safe message
packages or explicit contract-signature records with `@safe:merge`.

## See Also

- [safe:execute](execute.md)
- [safe:verify](verify.md)
