---
title: "aragonosx:upgrade"
---

Update an installed plugin to a newer build via the Plugin Setup Processor.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. Plugin update preparation and permission diffs require concrete version inputs.

## Syntax

```evml
aragonosx:upgrade <plugin> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `plugin` | `plugin` | Build time | Installed plugin to update |
| `[...params]` | `any` | Build time | Plugin update parameters |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--version` | `string` | Build time | Target version as <release>.<build> (default latest build) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Update the token-voting plugin to the latest build of its release
aragonosx:connect mydao (
  aragonosx:propose multisig (
    aragonosx:upgrade token-voting
  )
)
```

## Notes

- OSx only updates builds within the same release; upgrading across releases requires uninstalling and reinstalling.
- Must run inside a `propose` or `act` block. The emitted sequence temporarily grants the Plugin Setup Processor `UPGRADE_PLUGIN_PERMISSION` on the plugin (and `ROOT_PERMISSION` on the DAO) and revokes both afterwards.
