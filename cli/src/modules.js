import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Where the module folders live.
 *
 * Published, they sit in `cli/modules/` (see the `prepack` script). In the repo
 * they stay at the root — `notion-backlog/` next to `cli/` — so they remain
 * browsable on GitHub and the manual install documented in their READMEs keeps
 * working.
 */
export function modulesRoot() {
  const packaged = resolve(here, '..', 'modules');
  if (existsSync(packaged)) return packaged;
  return resolve(here, '..', '..');
}

function isModuleDir(path) {
  return statSync(path).isDirectory() && existsSync(join(path, 'module.json'));
}

export function discoverModules(root = modulesRoot()) {
  const modules = [];

  for (const entry of readdirSync(root)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'cli') continue;
    const path = join(root, entry);
    let usable = false;
    try {
      usable = isModuleDir(path);
    } catch {
      continue;
    }
    if (usable) modules.push(loadModule(path));
  }

  return modules.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadModule(dir) {
  const manifestPath = join(dir, 'module.json');
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${manifestPath} is not valid JSON: ${error.message}`);
  }
  validateModule(raw, manifestPath);
  return { ...raw, dir };
}

function validateModule(module, path) {
  const fail = (message) => {
    throw new Error(`${path}: ${message}`);
  };

  if (!module.id) fail('missing "id"');
  if (!module.version) fail('missing "version"');
  if (!Array.isArray(module.components)) fail('"components" must be an array');

  const questions = module.questions ?? {};
  const ids = new Set();

  for (const component of module.components) {
    if (!component.id) fail('a component has no "id"');
    if (ids.has(component.id)) fail(`duplicate component id "${component.id}"`);
    ids.add(component.id);

    for (const need of component.needs ?? []) {
      if (!questions[need]) fail(`component "${component.id}" needs unknown question "${need}"`);
    }
    for (const provided of component.provides ?? []) {
      if (!questions[provided]) fail(`component "${component.id}" provides unknown question "${provided}"`);
    }
  }

  for (const component of module.components) {
    for (const required of component.requires ?? []) {
      if (!ids.has(required)) fail(`component "${component.id}" requires unknown component "${required}"`);
    }
  }

  for (const key of Object.values(module.placeholders ?? {})) {
    if (!questions[key]) fail(`placeholder maps to unknown question "${key}"`);
  }
}

/** All components across modules, each tagged with the module it came from. */
export function allComponents(modules) {
  return modules.flatMap((module) =>
    module.components.map((component) => ({ module, component, key: `${module.id}/${component.id}` })),
  );
}

export function findComponent(modules, key) {
  return allComponents(modules).find((entry) => entry.key === key) ?? null;
}
