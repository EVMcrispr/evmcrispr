# @evmcrispr/sdk

[![](https://img.shields.io/npm/v/@evmcrispr/sdk.svg?logo=npm)](https://www.npmjs.com/package/@evmcrispr/sdk)

**_EVMcrispr is still in active development and its API might change until it reaches 1.0._**

The module-authoring SDK for [EVMcrispr](https://evmcrispr.com): everything a language module needs to define commands, helpers and their completions, plus the shared types and utilities used across the EVMcrispr packages. Every `@evmcrispr/module-*` package is built with it.

If you just want to run EVML scripts, you want [`@evmcrispr/core`](https://www.npmjs.com/package/@evmcrispr/core); reach for the SDK when you're writing a module of your own.

## Quick start

```sh
bun add @evmcrispr/sdk viem
```

```ts
import { defineCommand, defineModule, encodeAction } from "@evmcrispr/sdk";

const burn = defineCommand({
  name: "burn",
  description: "Burn tokens from the connected account.",
  args: [
    { name: "amount", type: "number", description: "Amount in token units (wei)" },
    { name: "token", type: "address", description: "Token address" },
  ],
  async run(_module, { amount, token }) {
    return [encodeAction(token, "burn(uint256)", [amount])];
  },
});

export default class MyModule extends defineModule("mymodule", [burn], []) {}
```

Register it on the shared tag with `evml.use(MyModule)` and `load mymodule` works inside scripts. `defineHelper` works the same way for `@mymodule:helper`-style helpers.

See the [writing-a-module guide](https://evmcrispr.com/contribute/writing-a-module/) for argument types, options, helpers, completions and testing.

## Contributing

We welcome community contributions!

Please check out our open [Issues](https://github.com/EVMcrispr/evmcrispr/issues) to get started.
