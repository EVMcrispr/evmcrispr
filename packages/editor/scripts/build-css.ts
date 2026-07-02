#!/usr/bin/env bun
/**
 * Compile the embeddable stylesheet with the Tailwind CLI:
 *   src/styles/embed.css → dist/style.css (+ dist/fonts)
 *
 * The source CSS references fonts relative to `src/styles`
 * (`../fonts/…`); the compiled bundle ships its own copy under
 * `dist/fonts`, so the url() is rebased accordingly.
 */
import { $ } from "bun";

await $`tailwindcss -i ./src/styles/embed.css -o ./dist/style.css --minify`;

const cssPath = "./dist/style.css";
const css = await Bun.file(cssPath).text();
await Bun.write(cssPath, css.replaceAll("../fonts/", "./fonts/"));

await $`mkdir -p ./dist/fonts`;
await $`cp ./src/fonts/PixelOperatorMono.ttf ./src/fonts/PixelOperatorMono-Bold.ttf ./dist/fonts/`;
