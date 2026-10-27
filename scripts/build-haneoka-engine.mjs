import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HANEOKA_COMMIT as commit, HANEOKA_PATCH_SHA as patchSha256 } from "../src/lib/deck/haneoka/request.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, ".haneoka/engine");
const output = path.join(root, "public/haneoka-team-engine");
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" });
if (!existsSync(path.join(source, ".git"))) {
  mkdirSync(path.dirname(source), { recursive: true });
  run("git", ["clone", "https://github.com/haneoka-gakuen/ournotes-team-builder.git", source]);
}
const current = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
if (execFileSync("git", ["status", "--porcelain"], { cwd: source, encoding: "utf8" }).trim())
  throw new Error("Haneoka engine cache has local changes: " + source);
if (current !== commit) {
  run("git", ["fetch", "origin", commit], source);
  run("git", ["checkout", "--detach", commit], source);
}
const patch = path.join(root, "patches/haneoka-rewards.patch");
if (createHash("sha256").update(readFileSync(patch)).digest("hex") !== patchSha256)
  throw new Error("Haneoka patch hash differs from the adapter's model identity");
const patchedRelative = ".haneoka/patched-" + commit.slice(0, 12) + "-" + patchSha256.slice(0, 12);
const patched = path.join(root, patchedRelative);
const files = execFileSync("git", ["ls-files", "-z"], { cwd: source, encoding: "utf8" }).split("\0").filter(Boolean);
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const prepared = path.join(patched, ".source-hashes.json");
if (existsSync(prepared)) {
  const hashes = JSON.parse(readFileSync(prepared, "utf8"));
  if (Object.keys(hashes).length !== files.length || files.some(name => !existsSync(path.join(patched, name)) || digest(path.join(patched, name)) !== hashes[name]))
    throw new Error("Generated Haneoka source has local changes: " + patched);
} else {
  for (const name of files) {
    const target = path.join(patched, name);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(source, name), target);
  }
  run("git", ["apply", "--directory=" + patchedRelative, patch]);
  writeFileSync(prepared, JSON.stringify(Object.fromEntries(files.map(name => [name, digest(path.join(patched, name))]))));
}
run("cargo", ["build", "--locked", "--release", "--lib", "--target", "wasm32-unknown-unknown",
  "--manifest-path", path.join(patched, "Cargo.toml"), "--target-dir", path.join(root, ".haneoka/target")]);
mkdirSync(output, { recursive: true });
run(process.execPath, ["build", "src/lib/deck/haneoka/solver.ts", "--target=browser", "--outfile=public/haneoka-team-engine/solver.mjs"]);
copyFileSync(path.join(root, ".haneoka/target/wasm32-unknown-unknown/release/haneoka_team_engine.wasm"), path.join(output, "team-engine.wasm"));
for (const name of ["LICENSE", "NOTICE"]) copyFileSync(path.join(source, name), path.join(output, name));
copyFileSync(patch, path.join(output, "moenotes.patch"));
const file = (name) => {
  const bytes = readFileSync(path.join(output, name));
  return { url: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
writeFileSync(path.join(output, "runtime.json"), JSON.stringify({
  model: { name: "Haneoka", source: "https://github.com/haneoka-gakuen/ournotes-team-builder", commit, patchSha256, patch: file("moenotes.patch") },
  js: file("solver.mjs"), wasm: file("team-engine.wasm"),
}, null, 2) + "\n");
console.log("Built pinned Haneoka runtime: /haneoka-team-engine/runtime.json");
