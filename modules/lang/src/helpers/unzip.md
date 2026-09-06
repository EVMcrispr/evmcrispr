---
title: "@lang:unzip"
---

Transpose an array of pairs into two separate arrays.

**On-chain (`@lang:unzip!`)**: Omitting lane returns both typed lanes. An explicit lane selects 0 or 1; keys and values select the corresponding lane.

**Returns**: `array`

## Syntax

```evml
@lang:unzip(pairs lane?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pairs` | `array` | Array of [a, b] pairs |
| `[lane]` | `number` | Which lane to keep: 0 (first of each pair) or 1 (second) |

<!-- HAND-WRITTEN -->

## See Also

- [@zip](zip.md) — combine two arrays into pairs
- [@keys](keys.md), the named form of lane 0 over a record
- [@values](values.md), the named form of lane 1 over a record

## On-chain face (@unzip!)

Transpose an array of pairs into both lanes when `lane` is omitted. Pass 0 or 1 to select one lane. Runtime results retain each lane’s type; when both lanes have different types, the ABI result is a tuple of arrays.
