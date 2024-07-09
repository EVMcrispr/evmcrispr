# Token List

## Installation and Usage

### Installation

First, install the required dependencies using:

```sh
bun i
```

### Building the Project

To build the project, use the following command:

```sh
bun run build
```

This will create a `./dist/main.js` bundle that includes all tree-shaken dependencies.

### Deployment

To deploy the project, follow these steps:

1. Create a function:

```sh
bun create-func $NAME
```

2. Deploy the function:

```sh
bun deploy-func $NAME
```

Replace `$NAME` with the desired name of your function.
