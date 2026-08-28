import { findComponent } from './modules.js';

/**
 * Expand a selection to include everything it requires.
 *
 * `requires` names components inside the same module. Ticking /go-auto pulls in
 * /go, which pulls in the ticket rules — and those arrive locked, so the user
 * sees why they are there rather than finding them unticked and wondering.
 */
export function resolveRequires(modules, selectedKeys) {
  const selected = new Set(selectedKeys);
  const locked = new Set();
  const queue = [...selectedKeys];

  while (queue.length) {
    const key = queue.shift();
    const entry = findComponent(modules, key);
    if (!entry) continue;

    for (const requiredId of entry.component.requires ?? []) {
      const requiredKey = `${entry.module.id}/${requiredId}`;
      if (selected.has(requiredKey)) continue;
      selected.add(requiredKey);
      locked.add(requiredKey);
      queue.push(requiredKey);
    }
  }

  return { keys: [...selected], locked: [...locked] };
}

/** Components that would break if `key` were removed — the reverse of requires. */
export function dependents(modules, key) {
  const entry = findComponent(modules, key);
  if (!entry) return [];

  return entry.module.components
    .filter((component) => (component.requires ?? []).includes(entry.component.id))
    .map((component) => `${entry.module.id}/${component.id}`);
}

/** Selected entries, in module then declaration order, so screens stay stable. */
export function orderSelection(modules, keys) {
  const wanted = new Set(keys);
  const out = [];

  for (const module of modules) {
    for (const component of module.components) {
      const key = `${module.id}/${component.id}`;
      if (wanted.has(key)) out.push({ module, component, key });
    }
  }

  return out;
}
