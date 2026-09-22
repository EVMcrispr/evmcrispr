---
title: "aragonosx:install"
---

Install a plugin into the connected DAO via the Plugin Setup Processor.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. Plugin setup preparation and permission diffs require concrete repository inputs.

## Syntax

```evml
aragonosx:install <variable> <repo> [...params]
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `variable` | `variable` | Build time | Variable name |
| `repo` | `repo` | Build time | Plugin repo subdomain or address |
| `[...params]` | `any` | Build time | Plugin setup parameters |

## Options

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `--version` | `string` | Build time | Version to install as <release>.<build> (default latest) |

<!-- HAND-WRITTEN -->

## Examples

```evml
# Install a multisig (members, settings, target config, metadata)
# through a token-voting proposal
aragonosx:connect mydao (
  aragonosx:propose token-voting --metadata "ipfs://QmMetadata" (
    aragonosx:install $multisig multisig [@me] [true 1] [0x0000000000000000000000000000000000000000 0] 0x00
  )
)
```

## Notes

- The setup parameters are ABI-encoded against the `prepareInstallation` inputs declared in the version's build metadata (fetched from IPFS).
- Must run inside a `propose` or `act` block: only the DAO itself can apply an installation. The emitted sequence is atomic — prepare, temporary `ROOT_PERMISSION` grant to the Plugin Setup Processor, apply, revoke.
- `$variable` is bound to the predicted plugin address (from simulating the preparation). If another installation for the same setup lands before the proposal executes, the transaction reverts rather than installing at a different address.
