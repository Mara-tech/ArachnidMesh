import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SETTINGS_PATH = '.claude/settings.json';

/**
 * Merge, never write over.
 *
 * The target project's settings.json already holds permissions, hooks and env
 * that have nothing to do with us. So: arrays are unioned, objects are merged
 * recursively, and an existing scalar always wins over ours. Unknown keys are
 * carried through untouched.
 *
 * settings.local.json is deliberately left alone — it is the user's own space.
 */
function mergeInto(target, source) {
  const added = [];

  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      const existing = Array.isArray(target[key]) ? target[key] : [];
      const missing = value.filter((v) => !existing.includes(v));
      if (missing.length) added.push(...missing.map((v) => `${key}: ${v}`));
      target[key] = [...existing, ...missing];
    } else if (value && typeof value === 'object') {
      target[key] ??= {};
      added.push(...mergeInto(target[key], value));
    } else if (!(key in target)) {
      target[key] = value;
      added.push(`${key}: ${value}`);
    }
  }

  return added;
}

export function readSettings(projectRoot) {
  const path = join(projectRoot, SETTINGS_PATH);
  if (!existsSync(path)) return { exists: false, settings: {} };
  try {
    return { exists: true, settings: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { exists: true, settings: null, error };
  }
}

/**
 * @returns {{settings: object, added: string[], unchanged: boolean}}
 *   `added` is what screen 3 reports; it is empty when the project already
 *   granted everything, which is what makes a second run a no-op.
 */
export function planSettingsMerge(projectRoot, contributions) {
  const { settings, error } = readSettings(projectRoot);
  if (error) throw new Error(`${SETTINGS_PATH} is not valid JSON — fix it before running: ${error.message}`);

  const merged = structuredClone(settings ?? {});
  const added = [];
  for (const contribution of contributions) {
    added.push(...mergeInto(merged, contribution));
  }

  return { settings: merged, added, unchanged: added.length === 0 };
}

/** Permissions to drop when a component is removed, if nothing else claims them. */
export function permissionsToRemove(componentSettings, stillInstalledSettings) {
  const keep = new Set();
  for (const settings of stillInstalledSettings) {
    for (const permission of settings?.permissions?.allow ?? []) keep.add(permission);
  }
  return (componentSettings?.permissions?.allow ?? []).filter((p) => !keep.has(p));
}
