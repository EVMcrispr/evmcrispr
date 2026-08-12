module.exports = {
  // Type check TypeScript files. `.astro` is in here because the website's
  // type-check is `astro check`, the only checker that sees inside Astro
  // templates — without it an astro-only commit is checked by nothing.
  "(apps|packages|modules)/**/*.(ts|tsx|astro)": () => "bun run type-check",

  // Lint and format TypeScript and JavaScript files
  "(apps|packages|modules)/**/*.(ts|tsx|js)": (filenames) => [
    `bunx biome check --write --unsafe --no-errors-on-unmatched ${filenames.join(" ")}`,
  ],

  // Catch Tailwind utilities renamed in v4. Report-only: the compiler still
  // emits CSS for the old names, so nothing else would flag them.
  "(apps|packages)/**/*.(tsx|jsx|astro|css)": (filenames) => [
    `bun scripts/check-tailwind-deprecations.ts ${filenames.join(" ")}`,
  ],
};
