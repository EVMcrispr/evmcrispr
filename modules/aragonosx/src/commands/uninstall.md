---
title: "aragonosx:uninstall"
---

Uninstall a plugin from the connected DAO via the Plugin Setup Processor.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. Plugin setup preparation determines the permission diff before signing.

## Syntax

```evml
aragonosx:uninstall <plugin> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `plugin` | `plugin` | Build time | Installed plugin to remove |
| `[...params]` | `any` | Build time | Plugin uninstallation parameters |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Remove the token-voting plugin through a multisig proposal
aragonosx:connect mydao (
  aragonosx:propose multisig (
    aragonosx:uninstall token-voting
  )
)
```

## Notes

- Must run inside a `propose` or `act` block: only the DAO itself can apply an uninstallation.
- The helper contracts recorded at installation time are passed back to the plugin setup; extra parameters (when a setup declares `prepareUninstallation` inputs) can be appended after the plugin identifier.
