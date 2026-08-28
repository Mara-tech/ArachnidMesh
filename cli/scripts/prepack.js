#!/usr/bin/env node
/**
 * Copy the module folders into `cli/modules/` for publishing.
 *
 * The modules live at the repository root — `notion-backlog/` next to `cli/` —
 * so they stay browsable on GitHub and the manual install their READMEs
 * describe keeps working. npm only publishes what sits under the package
 * directory, so pack time is when they move.
 *
 * `cli/modules/` is gitignored: it is a build output, and the source of truth
 * is the folder at the root.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(cliDir, '..');
const destination = join(cliDir, 'modules');

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

const copied = [];

for (const entry of readdirSync(repoRoot)) {
  if (entry.startsWith('.') || entry === 'cli' || entry === 'node_modules') continue;

  const source = join(repoRoot, entry);
  if (!statSync(source).isDirectory()) continue;
  if (!existsSync(join(source, 'module.json'))) continue;

  cpSync(source, join(destination, entry), {
    recursive: true,
    filter: (path) => !path.includes('node_modules') && !path.includes('__pycache__'),
  });
  copied.push(entry);
}

if (copied.length === 0) {
  process.stderr.write('prepack: no module found at the repository root — nothing would be published.\n');
  process.exit(1);
}

process.stdout.write(`prepack: bundled ${copied.join(', ')}\n`);
