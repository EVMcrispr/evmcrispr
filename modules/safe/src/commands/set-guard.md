---
title: "safe:set-guard"
---

Set the transaction guard of the Safe, a contract that checks every owner transaction before and after execution (e.g. a Zodiac ScopeGuard), or with --module its module guard (Safe v1.5.0 or later), which checks every module transaction.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Supports runtime fields inside smart blocks. Use explicit `@helper!` expressions or captured outputs; other fields are evaluated at build time.

## Syntax

```evml
safe:set-guard <guard>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `guard` | `address` | Runtime in smart blocks | Guard contract address |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--module` | `bool` | Build time | Set the module guard instead of the transaction guard (Safe v1.5.0 or later, or upgraded by safe:upgrade earlier in the block) |

<!-- HAND-WRITTEN -->

A Safe has two guards. The **transaction guard** checks every transaction
the owners execute through `execTransaction`. The **module guard** (Safe
v1.5.0 and later) checks every transaction a module executes through
`execTransactionFromModule`; before v1.5.0 modules bypass the guard
entirely. `--module` picks the module guard.

The command checks the guard before emitting the call:

- **Interface:** the Safe only accepts a guard that reports
  `ITransactionGuard` (`0xe6d7a83a`) or, with `--module`, `IModuleGuard`
  (`0x58401ed8`) through `supportsInterface`; otherwise it reverts with
  `GS300`/`GS301`. The command refuses such an address up front. An address
  with no code yet (a guard deployed earlier in the same block) is logged
  and not checked, and a runtime guard in a smart block is only known on
  chain.
- **Version:** `--module` refuses a Safe below v1.5.0, where
  `setModuleGuard` does not exist and the call would fall through to the
  fallback handler. A `safe:upgrade` earlier in the same block counts: the
  Safe is upgraded before the guard is set.

## Examples

Set a transaction guard:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $guard 0x9a4c5e6f0b1d2a3e4f5061728394a5b6c7d8e9f0
safe:execute $mySafe (
  safe:set-guard $guard
)
```

Upgrade a Safe and set its module guard in one transaction:

```evml
load safe

set $mySafe 0x5afe3855358e112b5647b952709e6165e1c1eeee
set $moduleGuard 0x9a4c5e6f0b1d2a3e4f5061728394a5b6c7d8e9f0
safe:propose $mySafe (
  safe:upgrade
  safe:set-guard $moduleGuard --module true
)
```

## See Also

- [safe:remove-guard](remove-guard.md)
- [@safe:guard](../helpers/guard.md)
- [safe:install-scope-guard](install-scope-guard.md)
- [safe:upgrade](upgrade.md)
