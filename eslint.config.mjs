import config from "@repo/eslint-config";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.astro/**",
      "**/coverage/**",
    ],
  },
  ...config,
];
