/**
 * Writes src/styles/md3/colors.css: the default Material 3 light and dark color schemes (src/lib/md3/tokens-css.ts).
 * Run with Bun (`bun scripts/generate-md3-tokens.ts`): material-color-utilities ships extensionless ESM imports that
 * plain Node cannot resolve.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMd3ColorsCss } from "../src/lib/md3/tokens-css";

const target = fileURLToPath(new URL("../src/styles/md3/colors.css", import.meta.url));
writeFileSync(target, buildMd3ColorsCss());
console.log(`[moenotes] wrote ${target}`);
