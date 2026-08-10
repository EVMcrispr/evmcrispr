---
title: "@contracts:codeAt"
---

Deployed bytecode at an address.

**On-chain (`@contracts:codeAt!`)**: Sees code a batch deployed in an earlier step, and an address that self-destructed or was redeployed, which a build-time read cannot.

**Returns**: `bytes`

## Syntax

```evml
@contracts:codeAt(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Contract or account address |

<!-- HAND-WRITTEN -->

## See Also

- [@contracts:storageAt](storageAt.md) — read a storage slot
- [sim:set-code](../../../sim/src/commands/set-code.md) — override bytecode in simulation

## On-chain face (@codeAt!)

The runtime code at an address, as one `code` read (`EXTCODECOPY` through
Operators), returned as `Bytes`.

The address may itself be live — a factory's predicted address, or a proxy's
implementation — so it materializes as a word rather than being resolved at
composition time. That is the whole reason to prefer the `!` face: it sees code
a batch deployed in an earlier step, and it sees an address that self-destructed
or was redeployed, neither of which a build-time read can.

### Notes

- Compare with `@hash!` rather than by value when you only care about identity;
  a full code payload is large.
