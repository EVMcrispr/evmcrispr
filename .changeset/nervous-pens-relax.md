---
'@1hive/evmcrispr': minor
---

- General changes to commands:
  - New eager run mode that fetches and return asynchronous and synchronous relevant data for building auto-completion suggestions.
  - New method that returns contextual suggestions for a given argument position. This suggestions take into account previous commands, previous filled arguments and other info to produce the list of suggestion items to auto-complete the position.
- Expose new `Cas11AST` class that contains multiple methods to manipulate the parsed tree.
- Expose new methods to retrieve bindings from `BindingsManager`.
