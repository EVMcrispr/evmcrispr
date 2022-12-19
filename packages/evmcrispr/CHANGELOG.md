# @1hive/evmcrispr

## 0.8.1

### Patch Changes

- db469c4: - New `print` command.
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

## 0.8.0

### Minor Changes

- 7f60b3e: - General changes to commands:
  - New eager run mode that fetches and return asynchronous and synchronous relevant data for building auto-completion suggestions.
  - New method that returns contextual suggestions for a given argument position. This suggestions take into account previous commands, previous filled arguments and other info to produce the list of suggestion items to auto-complete the position.
  - Expose new `Cas11AST` class that contains multiple methods to manipulate the parsed tree.
  - Expose new methods to retrieve bindings from `BindingsManager`.

## 0.7.1

### Patch Changes

- 317a0a2: -
  - `new-dao` command fixes.
  - Allow to use `new-token` command outside of `connect`.
  - Fix implicit string-to-bytes conversion.
  - Refactor interpreter error handling.
  - Refactor aragonos `Connector` instantiation.
  - Add missing kernel-prefixed dao app bindings.

## 0.7.0

### Minor Changes

- 05b03b6: This version comprises a complete refactoring, restructuring and abstraction of the library and the formalization of the evmcl language (now call cas11) by applying computer programming theory concepts.

  The functionality (commands and helpers) has been move to separated modules and the library is now a set of composable parsers that scan the cas11 scripts producing an AST (Abstract Syntax Tree) structure which is later processed by an interpreter (the evmcrispr).

  ## New features

  - New `switch <network name or id>` command that allows you to dynamically switch the chain at any point of the script.

  - New `load <module> [as <alias>]` command that allows you import modules containing a set of commands and helpers. At the moment there are two modules:

    - `std`: core module which is not required to import. It contains the following:
    - Commands: `load`, `exec`, `set` and `switch`.
    - Helpers: `@date`, `@get`, `@id`, `@ipfs`, `@me`, `@token` and `@token.balance`.

    - `aragonos`: aragon module which contains the following:
    - Commands: `act`, `connect`, `forward`, `grant`, `install`, `new-dao`, `new-token`, `revoke` and `upgrade`.
    - Helpers: `@aragonEns`.

  - New read-only method call operator `<contractAddress>::<method>(<args>)`. It also supports chainable calls. Example: `token-manager::token()::decimals()`.

  - `@calc()` helper has been deprecated in favor of native arithmetic expression operations that supports priority parenthesis. Example: `set $var1 (@token.balance(DAI, @me) * (5 - myContract::aMethodReturningNumber()))`.

  * Complete support of nested expression structures (e.g. arrays, block command expressions, call expressions, helper expressions, etc).

  * Support to recursive `connect` commands that allows you to define DAO-to-DAO operations scripts and have access to different organizations apps inside a scope.

  * The `forward` command is back. It allows you to customize the forward path by not having to define it in the `connect` command. This can be helpful when creating scripts that will be send through a forwarding path compose of apps from different DAOs.

  * Option arguments can now be used in-between commands. Example `my-command --anOpt 1e18 anotherArg --anotherOpt 1e18 anotherArg`.

  * Improved and enhanced error handling logic that displays the location (line and column number) and type of the failed expression along with the error message.

  * Error recovering logic implemented: parsers scan the whole script looking for the maximum amount of errors possible.
