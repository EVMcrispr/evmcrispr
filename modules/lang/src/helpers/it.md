---
title: "@lang:it!"
---

The current fold/map/filter element.

**On-chain (`@lang:it!`)**: Names the lambda element again alongside the prepend, so an expression can use it more than once (e.g. `@num!(* @it!)` squares).

**Returns**: `any`

## Syntax

```evml
@lang:it!
```

<!-- HAND-WRITTEN -->

## See Also

- [@map](map.md) — transform each element
- [@filter](filter.md) — keep elements by predicate
- [@all](all.md) / [@any](any.md) — fold predicates

## On-chain face (@it!)

The lambda element as an operand. Fold/map/filter already prepend the
element to the lambda's arguments; `@it!` names that same element again
so a body can use it twice (or more). Every occurrence — the prepend and
each `@it!` — becomes a substitution window on the template; the engine
writes the element at every window.

Only valid inside a lambda. Outside one it is an error.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# Square every cap: prepend supplies the left factor, @it! the right
assertions:assert @map!($vault::{caps()(uint256[])} @num!(* @it!)) == 0x1122
```

### Notes

- The prepend is kept on purpose: `@num!(* @it!)` is `mul(elem, elem)`,
  not a suppressed-prepend form that would need `@num!(@it! * @it!)`.
- Capturing an OUTER lambda's element inside an INNER lambda is
  unsupported — both binders share one global marker, and a smuggled
  outer marker in the inner AST is rejected rather than stamped wrong.

### See Also

- `assertions:assert`, `@map!`, `@filter!`
