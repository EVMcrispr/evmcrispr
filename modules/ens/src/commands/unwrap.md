---
title: "ens:unwrap"
experimental: true
sidebar:
  label: "ens:unwrap ⚗️"
---

Unwrap an ENS name from the NameWrapper.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

Smart blocks: build-time inputs only. The name selects a registrar/wrapper route and is normalized at build time.

## Syntax

```evml
ens:unwrap <name>
```

## Arguments

| Name | Type | Evaluation | Description |
|------|------|------------|-------------|
| `name` | `string` | Build time | Wrapped ENS name (e.g. mydao.eth) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load ens

# Unwrap a name back to the executing account
ens:unwrap mydao.eth
```

## Notes

- Fails if the name has burned `cannot-unwrap`.

## See Also

- [ens:wrap](wrap.md) — wrap a name
