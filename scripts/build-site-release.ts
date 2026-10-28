/**
 * The site build of `.github/workflows/build-site.yml`, in three modes (SITE_BUILD_MODE):
 *
 * - inspect: reuse a complete published `site-<key>` Release when one exists.
 * - build:   render the pinned commit with Astro, re-check the data version, then pack the output with the Go
 *            packer (`moenotes pack`: page-major ustar + zstd, split into 1 GiB parts) and write the manifest.
 *            Runs without any GitHub token.
 * - publish: upload the parts and the manifest into a draft prerelease, verify them from GitHub, then publish.
 *
 * The manifest format (schema 2) is read by server/internal/artifact; see docs/deployment.md.
 */
import { access, appendFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { SUPPORTED_LOCALES } from "../src/config/locales";
import { assetExportLag, buildKey, describeData, fetchJson, sourceDigest, sourceRevision, type AssetManifest } from "./site-data";

export interface BuildInput {
  key: string;
  revision: string;
  commit: string;
  fingerprint: string;
  publicEnv: Record<string, string>;
}
export interface SitePart {
  name: string;
  size: number;
  sha256: string;
}
export interface SiteManifest {
  schema: 2;
  key: string;
  revision: string;
  commit: string;
  data: { fingerprint: string; label: string };
  builtAt: string;
  locales: string[];
  format: "tar+zstd";
  size: number;
  sha256: string;
  parts: SitePart[];
  files: number;
  expandedBytes: number;
  pages: number;
}

const OUTPUT = resolve(".site-release");
const PARTS_DIR = join(OUTPUT, "parts");
const MANIFEST = "site-manifest.json";
const PART_PREFIX = "site.tar.zst.";
/** Matches server/internal/artifact: 1 GiB parts (GitHub allows 2 GiB per asset), at most 32 of them. */
export const PART_BYTES = 1024 * 1024 * 1024;
export const MAX_PARTS = 32;
const MAX_EXPANDED = 64 * 1024 * 1024 * 1024;
const MAX_FILES = 2_000_000;
const MAX_MANIFEST = 64 * 1024;
const PACKER = resolve(process.env.MOENOTES_PACKER ?? join(".site-release", "bin", "moenotes"));

export function partName(index: number): string {
  return `${PART_PREFIX}${String(index).padStart(3, "0")}`;
}

export function parseInput(env: Record<string, string | undefined>): BuildInput {
  const key = env.SITE_BUILD_KEY ?? "";
  const revision = env.SITE_BUILD_REVISION ?? "";
  const commit = env.SITE_BUILD_COMMIT ?? "";
  const fingerprint = env.SITE_BUILD_FINGERPRINT ?? "";
  if (!/^[a-f0-9]{16}$/.test(key)) throw new Error("Invalid SITE_BUILD_KEY");
  if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error("Invalid SITE_BUILD_REVISION");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid SITE_BUILD_COMMIT");
  if (!fingerprint || fingerprint.length > 16_384 || /[\x00-\x1f\x7f]/.test(fingerprint)) throw new Error("Invalid SITE_BUILD_FINGERPRINT");
  const raw = env.SITE_PUBLIC_ENV ?? "";
  if (Buffer.byteLength(raw, "utf8") > 48_000) throw new Error("SITE_PUBLIC_ENV exceeds 48000 bytes");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("SITE_PUBLIC_ENV must be JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SITE_PUBLIC_ENV must be an object");
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error("SITE_PUBLIC_ENV exceeds 100 variables");
  for (const [name, entry] of entries) {
    if (!/^PUBLIC_[A-Z0-9_]+$/.test(name) || typeof entry !== "string" || entry.length > 8192 || entry.includes("\0")) {
      throw new Error("SITE_PUBLIC_ENV must contain bounded PUBLIC_* string values only");
    }
  }
  if (key !== buildKey(revision, fingerprint, commit)) throw new Error("SITE_BUILD_KEY does not match revision, fingerprint and commit");
  return { key, revision, commit, fingerprint, publicEnv: Object.fromEntries(entries) };
}

/** Run before importing configuration: Bun also loads .env into the initial process environment. */
export function applyBuildEnvironment(input: BuildInput, env = process.env): void {
  for (const name of Object.keys(env)) {
    if (name.startsWith("PUBLIC_") || /TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name)) delete env[name];
  }
  Object.assign(env, input.publicEnv, {
    MOENOTES_BUILD_LOCALES: "all", MOENOTES_REVISION: input.commit, ASTRO_TELEMETRY_DISABLED: "1",
  });
  // Never inherit server-only origins or local MasterData overrides on a hosted runner.
  for (const name of ["MOENOTES_ASSET_INTERNAL", "MOENOTES_MASTERDATA_INTERNAL", "MOENOTES_MASTERDATA_DIR", "MOENOTES_VERSION_URL", "MOENOTES_SERVERS"]) delete env[name];
}

export function assertDataVersion(input: BuildInput, data: { fingerprint: string }, lag: string | null): void {
  if (data.fingerprint !== input.fingerprint) throw new Error("Upstream fingerprint changed; refusing release");
  if (lag !== null) throw new Error("Asset export is not synchronized; refusing release");
}

export function validateManifest(value: unknown, input: BuildInput): asserts value is SiteManifest {
  const m = value as SiteManifest | null;
  const fail = (reason: string) => { throw new Error(`Release manifest does not match the requested complete build: ${reason}`); };
  if (!m || typeof m !== "object") return fail("not an object");
  if (m.schema !== 2) fail("schema");
  if (m.key !== input.key || m.revision !== input.revision || m.commit !== input.commit) fail("identity");
  if (m.data?.fingerprint !== input.fingerprint || typeof m.data?.label !== "string" || !m.data.label) fail("data");
  if (typeof m.builtAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(m.builtAt) || !Number.isFinite(Date.parse(m.builtAt))) fail("builtAt");
  if (!Array.isArray(m.locales) || m.locales.length !== SUPPORTED_LOCALES.length
    || new Set(m.locales).size !== SUPPORTED_LOCALES.length
    || !SUPPORTED_LOCALES.every((locale) => m.locales.includes(locale))) fail("locales");
  if (m.format !== "tar+zstd") fail("format");
  if (!/^[a-f0-9]{64}$/.test(m.sha256)) fail("sha256");
  if (!Array.isArray(m.parts) || !m.parts.length || m.parts.length > MAX_PARTS) fail("parts");
  let total = 0;
  m.parts.forEach((part, index) => {
    if (part?.name !== partName(index) || !/^[a-f0-9]{64}$/.test(part.sha256) || !Number.isSafeInteger(part.size)
      || part.size <= 0 || part.size > PART_BYTES || (index < m.parts.length - 1 && part.size !== m.parts[0]!.size)) fail(`part ${index}`);
    total += part.size;
  });
  if (!Number.isSafeInteger(m.size) || m.size !== total) fail("size");
  if (!Number.isSafeInteger(m.files) || m.files <= 0 || m.files > MAX_FILES) fail("files");
  if (!Number.isSafeInteger(m.expandedBytes) || m.expandedBytes <= 0 || m.expandedBytes > MAX_EXPANDED) fail("expandedBytes");
  if (!Number.isSafeInteger(m.pages) || m.pages < 0 || m.pages > m.files) fail("pages");
  if (Object.keys(m).some((name) => !["schema", "key", "revision", "commit", "data", "builtAt", "locales", "format", "size", "sha256", "parts", "files", "expandedBytes", "pages"].includes(name))) fail("unknown field");
}

export async function hashFile(path: string, limit = PART_BYTES): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > limit) throw new Error(`${path} exceeds ${limit} bytes`);
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), size };
}

/** Checks every part of a directory against the manifest, and the whole stream's hash. */
export async function verifyParts(manifest: SiteManifest, directory: string): Promise<void> {
  const whole = createHash("sha256");
  let size = 0;
  for (const part of manifest.parts) {
    const hash = createHash("sha256");
    let partSize = 0;
    for await (const chunk of createReadStream(join(directory, part.name))) {
      partSize += chunk.length;
      if (partSize > part.size) throw new Error(`${part.name} is larger than its manifest entry`);
      hash.update(chunk);
      whole.update(chunk);
    }
    if (partSize !== part.size || hash.digest("hex") !== part.sha256) throw new Error(`${part.name} checksum or size mismatch`);
    size += partSize;
  }
  if (size !== manifest.size || whole.digest("hex") !== manifest.sha256) throw new Error("Release archive checksum or size mismatch");
}

export async function command(args: string[], capture = false): Promise<string> {
  return await new Promise((resolve, reject) => {
    // Build logs go straight to the runner. Only short machine-readable gh/git/packer output needs pipes.
    const child = spawn(args[0]!, args.slice(1), { stdio: ["ignore", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => {
      // Keep diagnostics bounded even if the site emits a long error log.
      stderr = (stderr + chunk.toString()).slice(-65_536);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) reject(new Error(`${args[0]} failed (${signal ?? code})${stderr ? `: ${stderr}` : "; see command output above"}`));
      else resolve(stdout);
    });
  });
}

export async function measuredCommand(args: string[], reportPath: string): Promise<void> {
  try {
    // time's diagnostics must not share Bun's subprocess stderr pipe. A regular file also preserves
    // the complete RSS/exit status report if logging fails. A nonzero measured command still fails CI.
    await command(["/usr/bin/time", "-v", "-o", reportPath, ...args]);
  } finally {
    try { console.log(await readFile(reportPath, "utf8")); }
    catch { console.warn("Build resource report is unavailable; see the command exit status above"); }
  }
}

interface PackResult { format: string; size: number; sha256: string; parts: SitePart[]; files: number; expandedBytes: number; pages: number }

async function build(input: BuildInput): Promise<void> {
  applyBuildEnvironment(input);
  if ((await command(["git", "rev-parse", "HEAD"], true)).trim() !== input.commit) {
    throw new Error("Checked-out commit does not match SITE_BUILD_COMMIT");
  }
  await access(PACKER).catch(() => { throw new Error(`Go packer not found at ${PACKER}; build server/cmd/moenotes first`); });
  // Dynamic imports are essential: configuration snapshots PUBLIC_* at module evaluation.
  const { assetConfig } = await import("../src/config/assets");
  const { masterdataConfig } = await import("../src/config/masterdata");
  if (sourceRevision(await sourceDigest(process.cwd()), process.env) !== input.revision) throw new Error("Source revision mismatch");
  const currentData = async () => {
    const manifest = await fetchJson<AssetManifest>(`${assetConfig.api}/versions/current_version.json`);
    const data = describeData(manifest);
    const lag = await assetExportLag(manifest, `${Object.values(masterdataConfig.sources)[0]}${masterdataConfig.versionPath}`);
    assertDataVersion(input, data, lag);
    return data;
  };
  const data = await currentData();
  // Keep .site-release/bin: the workflow builds the Go packer there before this step.
  const site = join(OUTPUT, "site");
  for (const leftover of [site, PARTS_DIR]) await rm(leftover, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });
  const cli = join(dirname(createRequire(import.meta.url).resolve("astro/package.json")), "bin", "astro.mjs");
  await measuredCommand([process.execPath, "--bun", cli, "build", "--root", process.cwd(), "--outDir", site], join(OUTPUT, "build-metrics.txt"));
  await access(join(site, "index.html"));
  const haneokaOut = join(site, "haneoka-team-engine");
  await command([process.execPath, join(process.cwd(), "scripts/build-haneoka-engine.mjs"), "--out", haneokaOut]);
  await access(join(haneokaOut, "runtime.json"));
  await access(join(haneokaOut, "team-engine.wasm"));
  await access(join(haneokaOut, "solver.mjs"));
  await currentData();
  const packed = JSON.parse(await command([PACKER, "pack", site, PARTS_DIR], true)) as PackResult;
  const manifest: SiteManifest = {
    schema: 2, key: input.key, revision: input.revision, commit: input.commit, data,
    builtAt: new Date().toISOString(), locales: [...SUPPORTED_LOCALES], format: "tar+zstd",
    size: packed.size, sha256: packed.sha256, parts: packed.parts, files: packed.files,
    expandedBytes: packed.expandedBytes, pages: packed.pages,
  };
  validateManifest(manifest, input);
  await verifyParts(manifest, PARTS_DIR);
  await writeFile(join(PARTS_DIR, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[site-release] ${manifest.files} files (${(manifest.expandedBytes / 2 ** 20).toFixed(0)} MiB) packed into ${manifest.parts.length} part(s), ${(manifest.size / 2 ** 20).toFixed(1)} MiB`);
  // The rendered output is no longer needed; free the runner's disk before the artifact upload.
  await rm(site, { recursive: true, force: true });
}

interface Release {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  target_commitish: string;
  assets: Array<{ name: string; size: number; state: string }>;
}
function repository(): string {
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid GITHUB_REPOSITORY");
  return repo;
}
async function api(path: string, ...args: string[]): Promise<unknown> {
  return JSON.parse(await command(["gh", "api", `repos/${repository()}/${path}`, ...args], true));
}
async function optionalApi(path: string): Promise<unknown | null> {
  try { return await api(path); } catch (error) {
    if (error instanceof Error && /\(HTTP 404\)/.test(error.message)) return null;
    throw error;
  }
}
export async function lookupRelease(
  tag: string,
  includeDrafts: boolean,
  request: (path: string) => Promise<unknown | null>,
): Promise<Release | null> {
  const published = await request(`releases/tags/${tag}`) as Release | null;
  if (published) {
    if (published.tag_name !== tag) throw new Error("Release tag mismatch");
    return published;
  }
  if (!includeDrafts) return null;
  // GitHub's by-tag REST endpoint can return 404 for an existing draft. The authenticated list
  // includes drafts; match tag_name, never its temporary untagged-* browser URL or title.
  for (let page = 1; page <= 10; page++) {
    const entries = await request(`releases?per_page=100&page=${page}`);
    if (!Array.isArray(entries)) throw new Error("Unable to list Releases; refusing to create a duplicate draft");
    const matches = (entries as Release[]).filter(entry => entry.tag_name === tag);
    if (matches.length > 1) throw new Error("Multiple Releases share the requested tag; refusing to overwrite");
    if (matches[0]) return matches[0];
    if (entries.length < 100) return null;
  }
  throw new Error("Release lookup exceeded pagination limit; refusing to create an unverified draft");
}
async function release(input: BuildInput, includeDrafts = false): Promise<Release | null> {
  return lookupRelease(`site-${input.key}`, includeDrafts, optionalApi);
}
async function verifyTag(input: BuildInput, create = false): Promise<void> {
  const tag = `site-${input.key}`;
  const ref = await optionalApi(`git/ref/tags/${tag}`) as { object: { type: string; sha: string } } | null;
  if (!ref) {
    if (!create) throw new Error("Release tag is missing");
    await api("git/refs", "--method", "POST", "-f", `ref=refs/tags/${tag}`, "-f", `sha=${input.commit}`);
    return;
  }
  let object = ref.object;
  for (let depth = 0; object.type === "tag" && depth < 8; depth++) {
    object = (await api(`git/tags/${object.sha}`) as { object: typeof object }).object;
  }
  if (object.type !== "commit" || object.sha !== input.commit) throw new Error("Release tag points at a different source commit");
}
async function readManifest(directory: string, input: BuildInput): Promise<SiteManifest> {
  const raw = await readFile(join(directory, MANIFEST));
  if (raw.length > MAX_MANIFEST) throw new Error("Release manifest is too large");
  const manifest: unknown = JSON.parse(raw.toString("utf8"));
  validateManifest(manifest, input);
  return manifest;
}
async function verifyFiles(input: BuildInput, directory: string): Promise<SiteManifest> {
  const manifest = await readManifest(directory, input);
  await verifyParts(manifest, directory);
  return manifest;
}
/** Every expected asset uploaded exactly once with a plausible size; nothing else. */
export function releaseComplete(existing: Pick<Release, "assets">, manifest?: SiteManifest): boolean {
  const uploaded = existing.assets.filter((asset) => asset.state === "uploaded");
  const manifestAsset = uploaded.filter((asset) => asset.name === MANIFEST);
  if (manifestAsset.length !== 1 || manifestAsset[0]!.size <= 0 || manifestAsset[0]!.size > MAX_MANIFEST) return false;
  if (!manifest) return true;
  return manifest.parts.every((part) => {
    const matches = uploaded.filter((asset) => asset.name === part.name);
    return matches.length === 1 && matches[0]!.size === part.size;
  });
}
async function download(tag: string, directory: string, patterns: string[]): Promise<void> {
  await command(["gh", "release", "download", tag, "--repo", repository(), "--dir", directory, ...patterns.flatMap((pattern) => ["--pattern", pattern])]);
}
async function completeRelease(input: BuildInput, existing: Release): Promise<boolean> {
  if (existing.draft) return false;
  if (!existing.prerelease || existing.target_commitish !== input.commit) throw new Error("Published Release metadata mismatch; cannot overwrite");
  await verifyTag(input);
  if (!releaseComplete(existing)) throw new Error("Published Release is incomplete or in an older format; delete it and its tag to rebuild");
  const directory = await mkdtemp(join(tmpdir(), "site-release-"));
  try {
    await download(`site-${input.key}`, directory, [MANIFEST]);
    const manifest = await readManifest(directory, input);
    if (!releaseComplete(existing, manifest)) throw new Error("Published Release is missing parts; cannot overwrite");
    await download(`site-${input.key}`, directory, [`${PART_PREFIX}*`]);
    await verifyParts(manifest, directory);
    return true;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function publish(input: BuildInput): Promise<void> {
  let existing = await release(input, true);
  if (existing && await completeRelease(input, existing)) return;
  const manifest = await verifyFiles(input, PARTS_DIR);
  const extra = (await readdir(PARTS_DIR)).filter((name) => name !== MANIFEST && !manifest.parts.some((part) => part.name === name));
  if (extra.length) throw new Error(`Unexpected files next to the parts: ${extra.join(", ")}`);
  await verifyTag(input, true);
  const tag = `site-${input.key}`;
  // The created draft is checked as the API returns it: the Release list can lag behind a new draft.
  existing ??= await api("releases", "--method", "POST", "-f", `tag_name=${tag}`, "-f", `target_commitish=${input.commit}`,
    "-F", "draft=true", "-F", "prerelease=true", "-f", "make_latest=false", "-f", `name=${tag}`,
    "-f", "body=Static site build (schema 2: page-major tar + zstd parts). Retained until a future manual retention policy; never automatically deleted.") as Release;
  if (!existing?.draft || existing.target_commitish !== input.commit) throw new Error("Release is not the expected draft; cannot overwrite");
  await command(["gh", "release", "upload", tag, ...manifest.parts.map((part) => join(PARTS_DIR, part.name)), join(PARTS_DIR, MANIFEST), "--repo", repository(), "--clobber"]);
  // Only publish after every asset has been uploaded and verified from GitHub.
  const directory = await mkdtemp(join(tmpdir(), "site-release-upload-"));
  try {
    await download(tag, directory, [MANIFEST, `${PART_PREFIX}*`]);
    await verifyFiles(input, directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
  await verifyTag(input);
  await command(["gh", "release", "edit", tag, "--repo", repository(), "--draft=false", "--prerelease", "--latest=false", "--target", input.commit]);
}

export async function main(): Promise<void> {
  const input = parseInput(process.env);
  const mode = process.env.SITE_BUILD_MODE ?? "build";
  if (mode === "build") await build(input);
  else if (mode === "inspect") {
    const existing = await release(input);
    const reuse = existing ? await completeRelease(input, existing) : false;
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `reuse=${reuse}\n`);
    console.log(reuse ? "Reusing verified published site Release" : "Site Release requires a build");
  } else if (mode === "publish") await publish(input);
  else throw new Error("Invalid SITE_BUILD_MODE");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Site release failed");
    process.exitCode = 1;
  });
}
