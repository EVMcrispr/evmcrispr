---
'@1hive/evmcrispr': patch
---

- New `print` command.
- New autocompletion suggestions for Aragon agents and tokens retrieved via the `@token` helper.
- New arithmetic operator `^` for exponentiation in mathematical calculations.
- Add support to the `goerli` network on the `aragonos` module.
- Add support to `payable` functions on the `exec` commands.
- Reintroduce `raw` command.
- Fix line endings in Windows.
- Fix `BigNumber` edge case operations.
- Fix underscored view function calls when using the call operator (`::`). For example: `token-manager::MINT_ROLE()`.
- Add improvements to `set` command.
- Add improvements to `@get` helper.
