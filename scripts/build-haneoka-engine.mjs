import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HANEOKA_COMMIT as commit } from "../src/lib/deck/haneoka/request.ts";

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
run("cargo", ["build", "--locked", "--release", "--lib", "--target", "wasm32-unknown-unknown",
  "--manifest-path", path.join(source, "Cargo.toml"), "--target-dir", path.join(root, ".haneoka/target")]);
mkdirSync(output, { recursive: true });
run(process.execPath, ["build", "src/lib/deck/haneoka/solver.ts", "--target=browser", "--outfile=public/haneoka-team-engine/solver.mjs"]);
copyFileSync(path.join(root, ".haneoka/target/wasm32-unknown-unknown/release/haneoka_team_engine.wasm"), path.join(output, "team-engine.wasm"));
for (const name of ["LICENSE", "NOTICE"]) copyFileSync(path.join(source, name), path.join(output, name));
const file = (name) => {
  const bytes = readFileSync(path.join(output, name));
  return { url: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
};
writeFileSync(path.join(output, "runtime.json"), JSON.stringify({
  model: { name: "Haneoka", source: "https://github.com/haneoka-gakuen/ournotes-team-builder", commit },
  js: file("solver.mjs"), wasm: file("team-engine.wasm"),
}, null, 2) + "\n");
console.log("Built pinned Haneoka runtime: /haneoka-team-engine/runtime.json");
