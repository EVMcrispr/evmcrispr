module.exports = {
  env: {
    node: true,
  },
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "plugin:prettier/recommended",
    "prettier",
  ],
  plugins: ["@typescript-eslint", "import", "react-hooks"],
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2020,
  },
  rules: {
    "import/order": [
      "error",
      {
        groups: ["external", "internal"],
        "newlines-between": "always-and-inside-groups",
      },
    ],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/consistent-type-imports": "warn",
    "@typescript-eslint/ban-ts-comment": "off",
    "sort-imports": [
      "warn",
      {
        ignoreDeclarationSort: true,
      },
    ],
    "spaced-comment": [
      "error",
      "always",
      {
        block: {
          markers: ["*"],
          balanced: true,
        },
      },
    ],
  },
};
