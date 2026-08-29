import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import circomGrammar from "@evmcrispr/editor/grammars/circom";
import evmlGrammar from "@evmcrispr/editor/grammars/evml";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { heredocPlugin } from "./ec-heredoc.mjs";

// Build reference sidebar by scanning the reference/ content directory.
// Modules with symlinked docs appear automatically after running generate-docs.
const REFERENCE_DIR = resolve(
  import.meta.dirname,
  "src/content/docs/reference",
);
const PRIORITY = ["std", "lang"]; // shown first, in this order

// Same convention as scripts/generate-docs.ts: the flag is read from the
// shell env (turbo declares it on the website build task).
const EXPERIMENTAL_ON =
  process.env.VITE_PUBLIC_EXPERIMENTAL === "true" ||
  process.env.VITE_PUBLIC_EXPERIMENTAL === "1";

// Astro's content-layer cache is keyed on file contents only, so flipping
// the experimental flag would otherwise serve remark output processed under
// the previous flag state. Bust the cache whenever the flag changes.
const FLAG_MARKER = resolve(import.meta.dirname, ".astro/experimental-flag");
if (
  !existsSync(FLAG_MARKER) ||
  readFileSync(FLAG_MARKER, "utf-8") !== String(EXPERIMENTAL_ON)
) {
  // Dev and build keep separate stores.
  rmSync(resolve(import.meta.dirname, ".astro/data-store.json"), {
    force: true,
  });
  rmSync(resolve(import.meta.dirname, "node_modules/.astro/data-store.json"), {
    force: true,
  });
  mkdirSync(dirname(FLAG_MARKER), { recursive: true });
  writeFileSync(FLAG_MARKER, String(EXPERIMENTAL_ON));
}

// Experimental marker appended to sidebar labels (same one generate-docs.ts
// uses in generated pages and tables).
const EXP_CHIP = " ⚗️";

// Experimental status comes from the module's package.json in the repo
// modules/ tree (same source generate-docs.ts reads).
const MODULES_DIR = resolve(import.meta.dirname, "../../modules");
function moduleIsExperimental(mod) {
  try {
    return (
      JSON.parse(
        readFileSync(resolve(MODULES_DIR, mod, "package.json"), "utf-8"),
      ).experimental === true
    );
  } catch {
    return false;
  }
}

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
    return {
      label: moduleIsExperimental(mod) ? mod + EXP_CHIP : mod,
      collapsed: true,
      items,
    };
  });
}

// Rewrite relative .md links (kept relative so they work when browsing the
// repo on GitHub) into site page URLs. Handles links within the reference
// content tree and repo-style cross-module links (../../../<mod>/src/...).
const DOCS_DIR = resolve(import.meta.dirname, "src/content/docs");
const CROSS_MODULE_RE =
  /(?:^|\/)([\w-]+)\/src\/(commands|helpers)\/([^/]+)\.md$/;

// Starlight page slug: lowercased, dots stripped (abi.decode → abidecode).
function pageSlug(segment) {
  return segment.toLowerCase().replace(/\./g, "");
}

function remarkRewriteMdLinks() {
  return (tree, file) => {
    const visit = (node) => {
      if (
        node.type === "link" &&
        node.url &&
        !/^([a-z]+:|\/|#)/i.test(node.url)
      ) {
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

// Resolve experimental gating at build time — no client-side JS involved.
// (The text-level twin of this transform lives in
// packages/sdk/src/utils/experimental.ts and serves llms-full.txt and the
// CLI docs loader; this plugin is the mdast rendering of the same blocks.)
//
//  - `:::experimental` container blocks (parsed by remark-directive, which
//    Starlight registers for its own asides): removed when the flag is off,
//    rendered as a Starlight "caution" aside titled "Experimental" when on.
//  - Pages with `experimental: true` frontmatter: body replaced by a stub
//    when the flag is off (the sidebar link is dropped separately below).
// mdast for the experimental badge line (the website twin of
// EXPERIMENTAL_BADGE in packages/sdk/src/utils/experimental.ts).
function experimentalBadgeNode() {
  return {
    type: "paragraph",
    children: [
      { type: "text", value: "⚗️ " },
      { type: "strong", children: [{ type: "text", value: "Experimental" }] },
      { type: "text", value: " — available at " },
      {
        type: "link",
        url: "https://next.evmcrispr.com",
        children: [{ type: "text", value: "next.evmcrispr.com" }],
      },
      { type: "text", value: "." },
    ],
  };
}

/** Whether the page body already carries the badge (generated reference
 *  pages embed EXPERIMENTAL_BADGE in their markdown). */
function hasExperimentalBadge(tree) {
  return tree.children.some(
    (n) =>
      n.type === "paragraph" &&
      n.children?.[0]?.type === "text" &&
      n.children[0].value.startsWith("⚗️"),
  );
}

function remarkExperimental() {
  return (tree, file) => {
    const frontmatter = file.data.astro?.frontmatter;
    if (frontmatter?.experimental === true && EXPERIMENTAL_ON) {
      if (!hasExperimentalBadge(tree)) {
        tree.children.unshift(experimentalBadgeNode());
      }
    }
    if (frontmatter?.experimental === true && !EXPERIMENTAL_ON) {
      tree.children = [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value:
                "⚗️ This page documents an experimental feature — available at ",
            },
            {
              type: "link",
              url: "https://next.evmcrispr.com",
              children: [{ type: "text", value: "next.evmcrispr.com" }],
            },
            { type: "text", value: "." },
          ],
        },
      ];
      return;
    }
    const visit = (node) => {
      const children = node.children ?? [];
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (
          child.type === "containerDirective" &&
          child.name === "experimental"
        ) {
          if (!EXPERIMENTAL_ON) {
            children.splice(i, 1);
            continue;
          }
          // Hand the node to Starlight's aside transformer (it runs after
          // user plugins) as :::caution[Experimental].
          child.name = "caution";
          child.children.unshift({
            type: "paragraph",
            data: { directiveLabel: true },
            children: [{ type: "text", value: "⚗️ Experimental" }],
          });
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

/** Sidebar item for a hand-written doc page; null when the page is
 *  experimental and this build has the flag off, tagged when it's on. */
function docItem(label, slug) {
  const path = resolve(DOCS_DIR, `${slug}.md`);
  if (existsSync(path)) {
    const head = readFileSync(path, "utf-8").slice(0, 500);
    if (/^experimental:\s*true$/m.test(head)) {
      return EXPERIMENTAL_ON ? { label: label + EXP_CHIP, slug } : null;
    }
  }
  return { label, slug };
}

// ---------------------------------------------------------------------------
// Self-hosted Monaco assets for the homepage hero terminal
// ---------------------------------------------------------------------------
// @evmcrispr/editor loads monaco's AMD build from `/vs` on the page's own
// origin (no CDN — injected <script> tags can't be hash-verified). Same
// plugin as apps/evmcrispr-terminal/vite.config.ts: dev serves straight from
// the installed monaco-editor package, build copies min/vs into the output.
// monaco-editor isn't a direct dependency here, so it's resolved through
// @evmcrispr/editor, which pins it.
const MONACO_MIME = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

function monacoAssets() {
  const require = createRequire(import.meta.url);
  const editorRequire = createRequire(
    require.resolve("@evmcrispr/editor/package.json"),
  );
  // monaco's exports map hides package.json; the "." require entry points
  // at min/vs/index.js, whose directory is the AMD build we serve.
  const vsDir = dirname(editorRequire.resolve("monaco-editor"));
  let copyTarget = "";
  return {
    name: "monaco-assets",
    configResolved(config) {
      // Astro runs several vite builds; only the client build's outDir is
      // the published site (the server build is a temp dir that gets
      // cleaned up, so a stray copy there is harmless).
      copyTarget = join(resolve(config.root, config.build.outDir), "vs");
    },
    configureServer(server) {
      server.middlewares.use("/vs", (req, res, next) => {
        const rel = normalize(
          decodeURIComponent((req.url ?? "/").split("?")[0]),
        ).replace(/^[/\\]+/, "");
        const file = join(vsDir, rel);
        if (
          !file.startsWith(vsDir + sep) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          return next();
        }
        res.setHeader(
          "Content-Type",
          MONACO_MIME[extname(file)] ?? "application/octet-stream",
        );
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (copyTarget) cpSync(vsDir, copyTarget, { recursive: true });
    },
  };
}

export default defineConfig({
  // Canonical site URL (sitemap, og tags). The experimental deploy
  // overrides PUBLIC_SITE_URL with its own domain.
  site: process.env.PUBLIC_SITE_URL || "https://evmcrispr.com",
  redirects: {
    // Pre-restructure URLs (Guides mixed user and contributor docs).
    "/guides/getting-started": "/intro/getting-started",
    "/guides/language-basics": "/language/syntax",
    "/guides/batch-transactions": "/language/blocks-and-batching",
    "/guides/custom-modules": "/contribute/writing-a-module",
    "/architecture": "/contribute/architecture",
    "/contributing": "/contribute/contributing",
  },
  markdown: {
    // Keep -- as typed (e.g. command --options) instead of SmartyPants
    // turning it into an en dash.
    smartypants: false,
    remarkPlugins: [remarkRewriteMdLinks, remarkExperimental],
  },
  integrations: [
    starlight({
      components: {
        ThemeProvider: "./src/components/ThemeProvider.astro",
      },
      customCss: ["/src/styles/starlight-theme.css"],
      expressiveCode: {
        // expressiveCode's bundled shiki knows source.solidity/json but not
        // circom — the <<<CIRCOM heredoc grammar must be supplied explicitly.
        shiki: { langs: [evmlGrammar, circomGrammar] },
        plugins: [heredocPlugin()],
      },
      favicon: "/favicon.ico",
      head: [
        {
          // The ⚗️ experimental marker lands in escaped contexts (page
          // titles, sidebar labels, table cells) where markdown/HTML can't
          // emit an icon — swap each occurrence for the lucide flask-conical
          // SVG (with an "Experimental" tooltip) globally instead.
          tag: "script",
          content: `document.addEventListener("DOMContentLoaded",()=>{const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;display:inline-block;vertical-align:-0.125em" role="img" aria-label="Experimental"><title>Experimental</title><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/></svg>';const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode()){const n=w.currentNode;if(n.nodeValue.includes("\\u2697\\uFE0F")&&!["SCRIPT","STYLE","TEXTAREA"].includes(n.parentElement?.tagName))nodes.push(n)}for(const n of nodes){const parts=n.nodeValue.split("\\u2697\\uFE0F");const frag=document.createDocumentFragment();parts.forEach((p,i)=>{if(p)frag.appendChild(document.createTextNode(p));if(i<parts.length-1){const t=document.createElement("template");t.innerHTML=svg;const el=t.content.firstChild;el.title="Experimental";frag.appendChild(el)}});n.replaceWith(frag)}});`,
        },
      ],
      title: "EVMcrispr",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "EVMcrispr",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/EVMcrispr/evmcrispr",
        },
      ],
      sidebar: [
        {
          label: "Introduction",
          items: [
            docItem("Getting Started", "intro/getting-started"),
            docItem("Running Scripts", "intro/running-scripts"),
            docItem("How EVMcrispr Works", "intro/what-is-evmcrispr"),
          ].filter(Boolean),
        },
        {
          label: "The EVML Language",
          items: [
            docItem("Syntax", "language/syntax"),
            docItem("Values & Variables", "language/values-and-variables"),
            docItem("ABI Signatures", "language/abi-signatures"),
            docItem("Control Flow", "language/control-flow"),
            docItem("Blocks & Batching", "language/blocks-and-batching"),
            docItem("Event & Error Captures", "language/captures"),
            docItem("Modules & Imports", "language/modules"),
          ].filter(Boolean),
        },
        {
          label: "Guides",
          items: [
            docItem("Simulation", "guides/simulation"),
            docItem("Working with DAOs", "guides/working-with-daos"),
            docItem("Sharing Scripts", "guides/sharing-scripts"),
            docItem("Publishing Modules", "guides/publishing-modules"),
            docItem("MCP Server", "guides/mcp"),
          ].filter(Boolean),
        },
        {
          label: "Reference",
          items: buildReferenceSidebar(),
        },
        {
          label: "Contributing",
          collapsed: true,
          items: [
            docItem("Architecture", "contribute/architecture"),
            docItem("Writing a Module", "contribute/writing-a-module"),
            docItem("Development", "contribute/contributing"),
          ].filter(Boolean),
        },
      ],
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss(), monacoAssets()],
  },
});
