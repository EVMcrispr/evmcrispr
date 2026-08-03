---
title: "@noir:vkey"
---

Compile Noir source and return its UltraHonk verification key as 0x-hex bytes — feed it to @noir:verify for off-chain checks. Defaults to the keccak (EVM) transcript so it matches proofs from noir:prove; pass oracle:poseidon for bb's native transcript.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@noir:vkey(source oracle:<value>)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | Noir source code, or a http(s)/ipfs URL to fetch it from |
| `oracle:` | `string` | Proof transcript: `oracle:keccak` (default) or `oracle:poseidon` |

<!-- HAND-WRITTEN -->

## Examples

```evml
set $src <<<NOIR
fn main(x: Field, y: pub Field) {
    assert(x != y);
}
NOIR

# Keccak (EVM) transcript — matches noir:prove's default
set $vk @noir:vkey($src)

# bb's native transcript, for off-chain-only flows
set $vkposeidon @noir:vkey($src oracle:poseidon)
```

## See Also

- [@noir:verify](verify.md) — consumes this vkey
- [noir:prove](../commands/prove.md) — the proofs it checks
