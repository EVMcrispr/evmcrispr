---
title: "semaphore:prove"
---

Prove membership in a Semaphore group anonymously, signaling a message nullified per scope, and bind the proof JSON to <variable>. Uses the production ceremony artifacts for the group's tree depth. Requires an identity derived this session (semaphore:identity).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: cannot be nested. This command performs an immediate wallet, RPC, external-service or control-flow operation and cannot run inside an atomic batch.

## Syntax

```evml
semaphore:prove <variable>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable to bind the proof JSON to |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--group` | `number` | Build time | Group id to prove membership in |
| `--message` | `any` | Build time | Message (number, hex or string) the proof signals |
| `--scope` | `any` | Build time | Scope (external nullifier) — one accepted proof per identity per scope |
| `--identity` | `number` | Build time | Identity commitment to prove with (default: the only identity of this session) |

<!-- HAND-WRITTEN -->

## Signals and scopes

`--message` is the value your proof signals; `--scope` is the external
nullifier — the contract accepts **one proof per identity per scope**, so
scope a poll id, an epoch, or any replay boundary. Values may be numbers,
hex, or strings (a string becomes its UTF-8 bytes as a number, matching
the Semaphore SDK). Raw values ride in the proof JSON; the circuit sees
them keccak-hashed, exactly as the contract re-hashes them on
verification.

## Artifacts

Proving uses the real Semaphore ceremony artifacts for the group's tree
depth, fetched from `snark-artifacts.pse.dev` on first use and cached for
the session. There is no dev-mode setup: these proofs are
production-grade.

## Examples

```evml
load semaphore

# One-time: derive your identity (the wallet signs a fixed message)
semaphore:identity $me

# Group admin
semaphore:create-group $group
semaphore:add-member $me to $group

# Anonymous signal: prove membership, nullified per scope
semaphore:prove $proof --group $group --message "approve proposal 42" --scope 42
semaphore:validate $proof for $group
```

## See Also

- [semaphore:validate](validate.md) — record the signal on-chain
- [@semaphore:verify](../helpers/verify.md) — check without a transaction
