#!/usr/bin/env node
// Rewrites every npm package's version (and optionalDependencies pins) to
// match Cargo.toml. Invoked by the release workflow before `npm publish`.
//
// Usage: node npm/sync-version.mjs [version]
//   If no version is given, parses Cargo.toml [package].version.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const npmDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(npmDir);

function readCargoVersion() {
  const toml = readFileSync(join(repoRoot, "Cargo.toml"), "utf8");
  const pkgSection = toml.split(/^\[[^\]]+\]/m)[1] ?? toml;
  const match = pkgSection.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("could not find [package].version in Cargo.toml");
  return match[1];
}

const version = process.argv[2] ?? readCargoVersion();
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  throw new Error(`invalid semver: ${version}`);
}

const targets = [
  "nsl",
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
  "win32-x64",
];

for (const target of targets) {
  const path = join(npmDir, target, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = version;
  if (pkg.optionalDependencies) {
    for (const key of Object.keys(pkg.optionalDependencies)) {
      pkg.optionalDependencies[key] = version;
    }
  }
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ${target} -> ${version}`);
}
