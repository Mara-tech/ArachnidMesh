import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const MANIFEST_PATH = '.claude/.arachnid.json';
const MANIFEST_VERSION = 1;

/**
 * Hash of a file's content, with line endings normalised.
 *
 * Windows checkouts turn LF into CRLF, which would make every file look edited
 * on the next run. What we want to detect is a human editing the content, not
 * git rewriting the line endings.
 */
export function hashContent(content) {
  const normalised = content.replace(/\r\n/g, '\n');
  return 'sha256:' + createHash('sha256').update(normalised, 'utf8').digest('hex');
}

export function hashFile(path) {
  if (!existsSync(path)) return null;
  return hashContent(readFileSync(path, 'utf8'));
}

export function emptyManifest() {
  return { version: MANIFEST_VERSION, cli: null, answers: {}, unconfigured: [], modules: {} };
}

export function readManifest(projectRoot) {
  const path = join(projectRoot, MANIFEST_PATH);
  if (!existsSync(path)) return emptyManifest();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { ...emptyManifest(), ...parsed };
  } catch {
    // A corrupt manifest must not block the run: we treat it as absent and say
    // so, rather than crashing on someone's hand-edited JSON.
    return { ...emptyManifest(), corrupt: true };
  }
}

export function writeManifest(projectRoot, manifest) {
  const path = join(projectRoot, MANIFEST_PATH);
  mkdirSync(dirname(path), { recursive: true });
  const { corrupt, ...clean } = manifest;
  writeFileSync(path, JSON.stringify(clean, null, 2) + '\n', 'utf8');
  return path;
}

/** Every component id installed, as "moduleId/componentId". */
export function installedComponents(manifest) {
  const out = [];
  for (const [moduleId, mod] of Object.entries(manifest.modules ?? {})) {
    for (const componentId of Object.keys(mod.components ?? {})) {
      out.push(`${moduleId}/${componentId}`);
    }
  }
  return out;
}

export function componentRecord(manifest, moduleId, componentId) {
  return manifest.modules?.[moduleId]?.components?.[componentId] ?? null;
}

/**
 * Files the manifest says we wrote, and whose content no longer matches.
 * These are the ones a human edited after installation — never overwritten
 * without being shown.
 */
export function locallyEdited(projectRoot, manifest) {
  const edited = [];
  for (const [moduleId, mod] of Object.entries(manifest.modules ?? {})) {
    for (const [componentId, comp] of Object.entries(mod.components ?? {})) {
      for (const [relPath, record] of Object.entries(comp.files ?? {})) {
        const current = hashFile(join(projectRoot, relPath));
        if (current === null) {
          edited.push({ moduleId, componentId, path: relPath, reason: 'missing' });
        } else if (current !== record.hash) {
          edited.push({ moduleId, componentId, path: relPath, reason: 'edited' });
        }
      }
    }
  }
  return edited;
}

export function recordComponent(manifest, moduleId, moduleVersion, componentId, files) {
  manifest.modules ??= {};
  manifest.modules[moduleId] ??= { version: moduleVersion, components: {} };
  manifest.modules[moduleId].version = moduleVersion;
  manifest.modules[moduleId].components[componentId] = {
    installedAt: new Date().toISOString(),
    files,
  };
}

export function forgetComponent(manifest, moduleId, componentId) {
  const mod = manifest.modules?.[moduleId];
  if (!mod) return;
  delete mod.components?.[componentId];
  if (Object.keys(mod.components ?? {}).length === 0) delete manifest.modules[moduleId];
}

/**
 * Answers, minus anything a question declared secret.
 *
 * A token is asked for the call that needs it and is never persisted: the
 * manifest is committed to the user's repository.
 */
export function persistableAnswers(answers, questionCatalogue) {
  const out = {};
  for (const [key, value] of Object.entries(answers)) {
    if (questionCatalogue[key]?.secret) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}
