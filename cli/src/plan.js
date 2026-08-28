import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { componentRecord, hashContent, hashFile } from './manifest.js';
import { render } from './render.js';
import { planSettingsMerge } from './settings.js';

const toPosix = (path) => path.split(sep).join('/');

/** Every file under a target's `from`, as [absoluteSource, relativeSuffix]. */
function expandSource(moduleDir, from) {
  const source = join(moduleDir, from);
  if (!existsSync(source)) throw new Error(`module file not found: ${source}`);

  if (statSync(source).isFile()) return [[source, '']];

  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.push([path, toPosix(relative(source, path))]);
    }
  };
  walk(source);
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}

function fileChange({ projectRoot, manifest, moduleId, componentId, target, sourcePath, suffix, placeholders, answers }) {
  const relPath = toPosix(suffix ? join(target.to, suffix) : target.to);
  const absPath = join(projectRoot, relPath);

  const raw = readFileSync(sourcePath, 'utf8');
  const { content, unresolved } = target.mode === 'template'
    ? render(raw, placeholders, answers)
    : { content: raw, unresolved: [] };

  const hash = hashContent(content);
  const existing = existsSync(absPath) ? hashFile(absPath) : null;
  const recorded = componentRecord(manifest, moduleId, componentId)?.files?.[relPath]?.hash ?? null;

  let action;
  if (existing === null) {
    action = 'create';
  } else if (existing === hash) {
    action = 'unchanged';
  } else if (recorded !== null && existing !== recorded) {
    // We wrote it, and it no longer matches what we wrote: a human edited it.
    action = 'skip-edited';
  } else {
    action = 'update';
  }

  return {
    kind: 'file',
    action,
    path: relPath,
    mode: target.mode,
    content,
    hash,
    moduleId,
    componentId,
    unresolved,
  };
}

const MARKER_START = (moduleId) => `<!-- arachnid:${moduleId} -->`;
const MARKER_END = (moduleId) => `<!-- /arachnid:${moduleId} -->`;

/**
 * The module's CLAUDE.md block, inserted between markers.
 *
 * The fragments come from the *installed* components, concatenated in
 * declaration order — so a CLAUDE.md never announces `/go-auto` to the agent
 * when `/go-auto` was not ticked. An instruction file that describes commands
 * that do not exist is worse than one that says nothing.
 *
 * The markers are what make this idempotent: on update the block is replaced in
 * place, so the file does not accumulate a new copy on every run, and whatever
 * the user wrote around it is untouched.
 */
export function claudeMdChange({ projectRoot, module, fragmentPaths, placeholders, answers }) {
  if (!fragmentPaths.length) return null;

  const unresolved = [];
  const fragments = fragmentPaths.map((fragmentPath) => {
    const raw = readFileSync(join(module.dir, fragmentPath), 'utf8');
    const rendered = render(raw, placeholders, answers);
    unresolved.push(...rendered.unresolved);
    return rendered.content.trim();
  });

  const start = MARKER_START(module.id);
  const end = MARKER_END(module.id);
  const block = `${start}\n${fragments.join('\n\n')}\n${end}`;

  const relPath = 'CLAUDE.md';
  const absPath = join(projectRoot, relPath);
  const current = existsSync(absPath) ? readFileSync(absPath, 'utf8') : '';

  let next;
  if (current.includes(start) && current.includes(end)) {
    const before = current.slice(0, current.indexOf(start));
    const after = current.slice(current.indexOf(end) + end.length);
    next = before + block + after;
  } else {
    next = current.trim() ? `${current.trimEnd()}\n\n${block}\n` : `${block}\n`;
  }

  return {
    kind: 'claudeMd',
    action: current === next ? 'unchanged' : current ? 'update' : 'create',
    path: relPath,
    content: next,
    hash: hashContent(next),
    moduleId: module.id,
    unresolved,
  };
}

/**
 * Everything the run would write, computed before a single byte is written.
 *
 * Screen 3 shows this and asks. Doctor renders the same structure read-only.
 */
export function buildPlan({ projectRoot, selection, answers, manifest }) {
  const changes = [];
  const settingsContributions = [];
  const claudeMdFragments = new Map(); // module id -> { module, paths[] }

  for (const { module, component } of selection) {
    const placeholders = module.placeholders ?? {};

    if (component.claudeMd) {
      const entry = claudeMdFragments.get(module.id) ?? { module, paths: [] };
      entry.paths.push(component.claudeMd);
      claudeMdFragments.set(module.id, entry);
    }

    for (const target of component.targets ?? []) {
      for (const [sourcePath, suffix] of expandSource(module.dir, target.from)) {
        changes.push(
          fileChange({
            projectRoot,
            manifest,
            moduleId: module.id,
            componentId: component.id,
            target,
            sourcePath,
            suffix,
            placeholders,
            answers,
          }),
        );
      }
    }

    if (component.settings) settingsContributions.push(component.settings);
  }

  for (const { module, paths } of claudeMdFragments.values()) {
    const change = claudeMdChange({
      projectRoot,
      module,
      fragmentPaths: paths,
      placeholders: module.placeholders ?? {},
      answers,
    });
    if (change) changes.push(change);
  }

  const settings = planSettingsMerge(projectRoot, settingsContributions);
  if (!settings.unchanged) {
    changes.push({
      kind: 'settings',
      action: existsSync(join(projectRoot, '.claude/settings.json')) ? 'update' : 'create',
      path: '.claude/settings.json',
      content: JSON.stringify(settings.settings, null, 2) + '\n',
      added: settings.added,
    });
  }

  const unresolved = [];
  for (const change of changes) {
    for (const item of change.unresolved ?? []) {
      unresolved.push({ ...item, path: change.path });
    }
  }

  const writes = changes.filter((c) => c.action === 'create' || c.action === 'update');

  return {
    changes,
    unresolved,
    skipped: changes.filter((c) => c.action === 'skip-edited'),
    nothingToDo: writes.length === 0,
  };
}
