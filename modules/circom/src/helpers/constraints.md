---
title: "@circom:constraints"
---

Compile circom source (inline text or a http/ipfs URL) and return its constraint count — useful to size the powers-of-tau a setup needs (a 2^p ptau supports up to 2^p constraints).

**Returns**: `number`

## Syntax

```evml
@circom:constraints(source)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | circom source code, or a http(s)/ipfs URL to fetch it from |

<!-- HAND-WRITTEN -->

## Notes

- A Groth16 setup needs a powers-of-tau of at least the circuit's
  constraint count: a `2^p` ptau supports up to `2^p` constraints.
- Compiles are cached per source for the session, so following up with
  [@circom:verifier](verifier.md) or
  [circom:prove --circom](../commands/prove.md) reuses this compile.

## See Also

- [@circom:verifier](verifier.md) — set up and export the verifier
