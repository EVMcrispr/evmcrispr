---
title: "safe:upgrade"
---

Upgrade the Safe to v1.5.0 with Safe's SafeMigration contract (a delegatecall from the Safe), keeping its L2 or plain flavour and any custom fallback handler.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. The Safe's current singleton and fallback handler select the migration function at build time.

## Syntax

```evml
safe:upgrade
```

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--l2` | `bool` | Build time | Upgrade to the L2 (true) or plain (false) singleton; defaults to the flavour of the current one |
| `--keep-fallback-handler` | `bool` | Build time | Keep the current fallback handler even when it is an official one |

<!-- HAND-WRITTEN -->

Moves the Safe of the enclosing block to Safe v1.5.0 with Safe's own
`SafeMigration` contract, the same way the Safe web app's "Update Safe" does:
a single delegatecall from the Safe that rewrites its singleton and, when it
is an official one, its fallback handler. It works for any Safe from v1.3.0
on; the migration keeps the storage layout, owners, threshold, modules,
guard and nonce.

The command reads the Safe first and picks the migration function:

- **Singleton flavour:** a Safe on an official L2 singleton moves to the v1.5.0
  L2 singleton, any other to the plain one. `--l2 true|false` overrides it.
- **Fallback handler:** an official CompatibilityFallbackHandler (or none) is
  replaced with the v1.5.0 one; a custom handler is kept. `--keep-fallback-handler
  true` keeps an official one too.

A Safe already on v1.5.0 is left alone. The delegatecall goes to the
canonical `SafeMigration` of the chain, which `@safe:verify` recognizes and
does not flag.

The v1.5.0 fallback handler drops the legacy `isValidSignature(bytes,bytes)`
check. If the upgraded Safe owns Safes below v1.5.0, those can no longer use
its off-chain signatures; on-chain confirmations still work, and upgrading
them too restores it.

## Examples

Upgrade a Safe you control alone:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:execute $mySafe (
  safe:upgrade
)
```

Propose the upgrade for the other owners to confirm:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
safe:propose $mySafe (
  safe:upgrade
) --origin "Update Safe to v1.5.0"
```

## See Also

- [safe:execute](execute.md)
- [safe:propose](propose.md)
- [safe:set-fallback-handler](set-fallback-handler.md)
