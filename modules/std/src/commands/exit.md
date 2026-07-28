---
title: "exit"
---

Stop script execution immediately.

## Syntax

```evml
exit
```

## Examples

```evml
# Stop script execution
print "before"
exit
```

<!-- HAND-WRITTEN -->

## Notes

- `exit` is a clean stop, not an error: actions produced before it have already executed, everything after it is skipped.
- It stops the whole script from anywhere — including inside `loop` blocks and `def` command bodies. Use [`loop break`](loop.md) to leave just the loop, or [`def return`](def.md) to leave just the command body.

## See Also

- [if](if.md) — conditional execution
- [loop](loop.md) — `loop break` / `loop continue` for loop-scoped exits
- [def](def.md) — `def return` for command-body exits
