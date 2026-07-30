---
title: "@zk:circom.constraints"
---

Compile circom source (inline text or a http/ipfs URL) and return its constraint count — useful to size the powers-of-tau a setup needs (a 2^p ptau supports up to 2^p constraints).

**Returns**: `number`

## Syntax

```evml
@zk:circom.constraints(source)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `source` | `string` | circom source code, or a http(s)/ipfs URL to fetch it from |

## Examples

```evml
# Check how big a circuit is before setting it up (a 2^p powers-of-tau supports up to 2^p constraints)
set $src <<<CIRCOM
pragma circom 2.0.0;
template Multiplier2() {
    signal input a;
    signal input b;
    signal output c;
    c <== a * b;
}
component main = Multiplier2();
CIRCOM
print "Constraints:" @zk:circom.constraints($src)
```

<!-- HAND-WRITTEN -->

## Notes

- A Groth16 setup needs a powers-of-tau of at least the circuit's
  constraint count: a `2^p` ptau supports up to `2^p` constraints.
- Compiles are cached per source for the session, so following up with
  [@zk:circom.verifier](circom.verifier.md) or
  [zk:prove --circom](../commands/prove.md) reuses this compile.

## See Also

- [@zk:circom.verifier](circom.verifier.md) — set up and export the verifier
