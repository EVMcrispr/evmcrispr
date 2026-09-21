---
title: "@safe:merge"
---

Merge matching Safe packages, EOA signatures, or explicit contract signatures without network access. Current authorization is checked by verify and execute.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `string`

## Syntax

```evml
@safe:merge(package ...additions)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `package` | `string` | Base transaction or message package JSON |
| `[...additions]` | `string` | Package JSON, EOA signature bytes, or contract signature JSON |

<!-- HAND-WRITTEN -->

The first argument is an exported transaction or message package. Remaining
arguments are matching packages, 65-byte EIP-712 EOA signatures, or JSON records:

```json
{"type":"contract","owner":"0x2222222222222222222222222222222222222222","signature":"0x1234"}
```

Identical signatures are deduplicated; conflicting signatures for the same
owner fail. Packages must sign identical payloads. A signed child Safe message
may attach to a parent package only when its message is the parent's exact
signing bytes on the same chain. EOA wallet recovery bits 0/1 are normalized
to 27/28. `eth_sign`/personal-sign signatures are not accepted.

This helper makes no network calls. Recovered EOA addresses are not proof of
current ownership, and contract signatures remain unchecked until online
`safe:verify` or `safe:execute`. Arbitrary contract signatures must implement
the Safe-compatible legacy `isValidSignature(bytes,bytes)` interface.

Package transaction integers are decimal strings. Use `@http:json` to read
fields, `@http:fetch(stdin:)` and `print` to import/export the complete text, and `@ipfs`/`@ipfs.get`
for optional sharing. Ordinary JSON or array merging cannot validate signed
payload identity or pack contract signatures correctly.
