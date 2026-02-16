module.exports = {
  // Type check TypeScript files
  "(apps|packages)/**/*.(ts|tsx)": () => "bun run type-check",

  // Lint and format TypeScript and JavaScript files
  "(apps|packages)/**/*.(ts|tsx|js)": (filenames) => [
    `bunx biome check --write --unsafe ${filenames.join(" ")}`,
  ],
};
