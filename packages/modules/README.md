# @evmcrispr/modules

[![](https://img.shields.io/npm/v/@evmcrispr/modules.svg?logo=npm)](https://www.npmjs.com/package/@evmcrispr/modules)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

Meta-package that registers every official [EVMcrispr](https://evmcrispr.com) module on the shared `evml` tag. Use it when you want the full module catalog in one dependency; if bundle size matters, depend on individual `@evmcrispr/module-*` packages instead and register only what you need.

## Quick start

```sh
bun add @evmcrispr/core @evmcrispr/modules viem
```

```ts
import { evml } from "@evmcrispr/core";
import { registerAllModules } from "@evmcrispr/modules";

registerAllModules();

await evml`
  load token
  token:transfer 1e18 @token(DAI) to vitalik.eth
`.interpret();
```

Modules register lazily, so bundlers can still code-split: a module's code only loads when a script `load`s it.

Also exported: `MODULE_NAMES`, `EXPERIMENTAL_MODULE_NAMES`, `moduleEntries`, and `CORE_MODULES`/`sortModuleNames` from `@evmcrispr/modules/order`. Experimental modules stay disabled at runtime unless `VITE_PUBLIC_EXPERIMENTAL=true` is set.

## Contributing

We welcome community contributions!

Please check out our open [Issues](https://github.com/EVMcrispr/evmcrispr/issues) to get started.
