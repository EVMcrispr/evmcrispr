import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import evmlGrammar from "@repo/ui/grammars/evml";

// Build reference sidebar by scanning the reference/ content directory.
// Modules with symlinked docs appear automatically after running generate-docs.
const REFERENCE_DIR = resolve(import.meta.dirname, "src/content/docs/reference");
const PRIORITY = ["std", "lang"]; // shown first, in this order

function buildReferenceSidebar() {
  if (!existsSync(REFERENCE_DIR)) return [];
  const modules = readdirSync(REFERENCE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const sorted = [
    ...PRIORITY.filter((m) => modules.includes(m)),
    ...modules.filter((m) => !PRIORITY.includes(m)).sort(),
  ];

  return sorted.map((mod) => {
    const items = [];
    const commandsDir = resolve(REFERENCE_DIR, mod, "commands");
    const helpersDir = resolve(REFERENCE_DIR, mod, "helpers");
    if (existsSync(commandsDir) && readdirSync(commandsDir).length > 0) {
      items.push({
        label: "Commands",
        autogenerate: { directory: `reference/${mod}/commands` },
      });
    }
    if (existsSync(helpersDir) && readdirSync(helpersDir).length > 0) {
      items.push({
        label: "Helpers",
        autogenerate: { directory: `reference/${mod}/helpers` },
      });
    }
    return { label: mod, collapsed: true, items };
  });
}

export default defineConfig({
  integrations: [
    starlight({
      components: {
        ThemeProvider: "./src/components/ThemeProvider.astro",
      },
      customCss: ["/src/styles/starlight-theme.css"],
      expressiveCode: {
        shiki: { langs: [evmlGrammar] },
      },
      favicon: "/favicon.ico",
      title: "EVMcrispr",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/EVMcrispr/evmcrispr",
        },
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Getting Started", slug: "guides/getting-started" },
            { label: "Language Basics", slug: "guides/language-basics" },
            { label: "Working with DAOs", slug: "guides/working-with-daos" },
            { label: "Simulation", slug: "guides/simulation" },
            { label: "Batch Transactions", slug: "guides/batch-transactions" },
            { label: "Custom Modules", slug: "guides/custom-modules" },
            { label: "Architecture", slug: "architecture" },
            { label: "Contributing", slug: "contributing" },
          ],
        },
        {
          label: "Reference",
          items: buildReferenceSidebar(),
        },
      ],
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
