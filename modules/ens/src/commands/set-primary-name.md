---
title: "ens:set-primary-name"
---

Set the primary ENS name (reverse record) of the calling account.

## Syntax

```evml
ens:set-primary-name <name>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. mydao.eth) |

## Options

| Name | Type | Description |
|------|------|-------------|
| `--for` | `address` | Set the primary name of this contract instead (the caller must be the contract, its Ownable owner, or an approved operator) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Name the executing account (e.g. a DAO agent or Safe running this script)
ens:set-primary-name mydao.eth

# Name a contract owned by the executing account
ens:set-primary-name treasury.mydao.eth --for 0x1234567890abcdef1234567890abcdef12345678
```

## Notes

- The reverse record only counts as a primary name when the forward record
  matches: make sure `mydao.eth` resolves to the account first (see
  `ens:set-addr`).
- With `--for`, the caller must be the target contract itself, its `Ownable`
  owner, or an approved operator on the Reverse Registrar.

## See Also

- [ens:set-addr](set-addr.md) — set the forward address record
