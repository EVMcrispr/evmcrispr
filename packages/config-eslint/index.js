import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: ".*",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-useless-assignment": "off",
      "react-hooks/set-state-in-effect": "off",
      "preserve-caught-error": "off",
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
  },
);
