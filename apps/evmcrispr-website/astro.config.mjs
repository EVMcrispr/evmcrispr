import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import evmlGrammar from "@repo/ui/grammars/evml";

export default defineConfig({
  integrations: [
    starlight({
      customCss: ["/src/styles/starlight-theme.css"],
      expressiveCode: {
        shiki: { langs: [evmlGrammar] },
      },
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
          items: [
            {
              label: "std",
              collapsed: true,
              items: [
                {
                  label: "Commands",
                  autogenerate: { directory: "reference/std/commands" },
                },
                {
                  label: "Helpers",
                  autogenerate: { directory: "reference/std/helpers" },
                },
              ],
            },
            {
              label: "aragonos",
              collapsed: true,
              items: [
                {
                  label: "Commands",
                  autogenerate: { directory: "reference/aragonos/commands" },
                },
                {
                  label: "Helpers",
                  autogenerate: { directory: "reference/aragonos/helpers" },
                },
              ],
            },
            {
              label: "sim",
              collapsed: true,
              items: [
                {
                  label: "Commands",
                  autogenerate: { directory: "reference/sim/commands" },
                },
                {
                  label: "Helpers",
                  autogenerate: { directory: "reference/sim/helpers" },
                },
              ],
            },
            {
              label: "ens",
              collapsed: true,
              items: [
                {
                  label: "Commands",
                  autogenerate: { directory: "reference/ens/commands" },
                },
                {
                  label: "Helpers",
                  autogenerate: { directory: "reference/ens/helpers" },
                },
              ],
            },
            {
              label: "giveth",
              collapsed: true,
              items: [
                {
                  label: "Commands",
                  autogenerate: { directory: "reference/giveth/commands" },
                },
                {
                  label: "Helpers",
                  autogenerate: { directory: "reference/giveth/helpers" },
                },
              ],
            },
            {
              label: "http",
              collapsed: true,
              items: [
                {
                  label: "Commands",
                  autogenerate: { directory: "reference/http/commands" },
                },
                {
                  label: "Helpers",
                  autogenerate: { directory: "reference/http/helpers" },
                },
              ],
            },
          ],
        },
      ],
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
