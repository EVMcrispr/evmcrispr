module.exports = {
  // Type check TypeScript files
  "(apps|packages)/**/*.(ts|tsx)": () => "bun run type-check",

  // Lint then format TypeScript and JavaScript files
  "(apps|packages)/**/*.(ts|tsx|js)": (filenames) => [
    `bunx eslint --fix ${filenames.join(" ")}`,
    `bunx prettier --write ${filenames.join(" ")}`,
  ],
};
