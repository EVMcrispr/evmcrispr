#!/usr/bin/env bun
/**
 * Compile the embeddable stylesheet with the Tailwind CLI:
 *   src/styles/embed.css → dist/style.css
 */
import { $ } from "bun";

await $`tailwindcss -i ./src/styles/embed.css -o ./dist/style.css --minify`;
