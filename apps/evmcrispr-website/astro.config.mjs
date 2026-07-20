import { existsSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import evmlGrammar from "@evmcrispr/editor/grammars/evml";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Build reference sidebar by scanning the reference/ content directory.
// Modules with symlinked docs appear automatically after running generate-docs.
const REFERENCE_DIR = resolve(
  import.meta.dirname,
  "src/content/docs/reference",
);
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
    if (existsSync(resolve(REFERENCE_DIR, mod, "index.md"))) {
      items.push({ label: "Overview", link: `/reference/${mod}/` });
    }
    const commandsDir = resolve(REFERENCE_DIR, mod, "commands");
    const helpersDir = resolve(REFERENCE_DIR, mod, "helpers");
    if (existsSync(commandsDir) && readdirSync(commandsDir).length > 0) {
      items.push({
        label: "Commands",
        items: [{ autogenerate: { directory: `reference/${mod}/commands` } }],
      });
    }
    if (existsSync(helpersDir) && readdirSync(helpersDir).length > 0) {
      items.push({
        label: "Helpers",
        items: [{ autogenerate: { directory: `reference/${mod}/helpers` } }],
      });
    }
    return { label: mod, collapsed: true, items };
  });
}

// Rewrite relative .md links (kept relative so they work when browsing the
// repo on GitHub) into site page URLs. Handles links within the reference
// content tree and repo-style cross-module links (../../../<mod>/src/...).
const DOCS_DIR = resolve(import.meta.dirname, "src/content/docs");
const CROSS_MODULE_RE = /(?:^|\/)([\w-]+)\/src\/(commands|helpers)\/([^/]+)\.md$/;

// Starlight page slug: lowercased, dots stripped (abi.decode → abidecode).
function pageSlug(segment) {
  return segment.toLowerCase().replace(/\./g, "");
}

function remarkRewriteMdLinks() {
  return (tree, file) => {
    const visit = (node) => {
      if (node.type === "link" && node.url && !/^([a-z]+:|\/|#)/i.test(node.url)) {
        const hashIdx = node.url.indexOf("#");
        const path = hashIdx === -1 ? node.url : node.url.slice(0, hashIdx);
        const hash = hashIdx === -1 ? "" : node.url.slice(hashIdx);
        if (path.endsWith(".md")) {
          const cross = CROSS_MODULE_RE.exec(path);
          const rel = relative(DOCS_DIR, resolve(dirname(file.path), path));
          if (cross) {
            node.url = `/reference/${cross[1]}/${cross[2]}/${pageSlug(cross[3])}/${hash}`;
          } else if (!rel.startsWith("..")) {
            const segments = rel.replace(/\.md$/, "").split("/");
            if (segments.at(-1) === "index") segments.pop();
            node.url = `/${segments.map(pageSlug).join("/")}/${hash}`;
          }
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

export default defineConfig({
  site: "https://next-docs.evmcrispr.com",
  markdown: {
    // Keep -- as typed (e.g. command --options) instead of SmartyPants
    // turning it into an en dash.
    smartypants: false,
    remarkPlugins: [remarkRewriteMdLinks],
  },
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
    // Share the repo-root .env (VITE_DRPC_API_KEY) with the embedded
    // terminal island, same as the terminal app does.
    envDir: resolve(import.meta.dirname, "../.."),
    envPrefix: ["VITE_", "PUBLIC_"],
  },
});
