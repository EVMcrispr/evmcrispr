/**
 * Register all available EVMcrispr modules.
 * Import this file early in the app (before any EVMcrispr usage).
 *
 * Modules are auto-discovered from package.json dependencies by the
 * evmcrisprModules() Vite plugin — see vite.config.ts.
 */
import "virtual:evmcrispr-modules";
