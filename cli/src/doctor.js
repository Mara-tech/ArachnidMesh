import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findComponent } from './modules.js';
import { findUnresolved } from './render.js';
import { readSettings } from './settings.js';

/**
 * Read-only check of an installation.
 *
 * This is the replacement for the `grep -rn '<your-' .claude/skills/` the
 * manual setup documents. That grep misses three of the eight setup
 * placeholders: `<Backlog Name>` lives in CLAUDE.md, `<TICKET_ID_PREFIX>` and
 * `<your-notion-database-url>` in .claude/rules/. Here the list is the module's
 * own declaration and the scope is every file we actually wrote.
 */
export function diagnose({ projectRoot, modules, manifest }) {
  const findings = [];

  if (manifest.corrupt) {
    findings.push({ level: 'error', message: `${'.claude/.arachnid.json'} is not valid JSON — it was ignored` });
  }

  const installed = [];

  for (const [moduleId, mod] of Object.entries(manifest.modules ?? {})) {
    const available = modules.find((m) => m.id === moduleId);

    if (!available) {
      findings.push({ level: 'warn', message: `module "${moduleId}" is installed but not known to this CLI version` });
      continue;
    }

    if (available.version !== mod.version) {
      findings.push({
        level: 'info',
        message: `${moduleId}: installed ${mod.version}, available ${available.version} — run Update`,
      });
    }

    for (const [componentId, component] of Object.entries(mod.components ?? {})) {
      const entry = findComponent(modules, `${moduleId}/${componentId}`);
      installed.push({ moduleId, componentId, label: entry?.component.label ?? componentId });

      for (const [relPath, record] of Object.entries(component.files ?? {})) {
        const absPath = join(projectRoot, relPath);

        if (!existsSync(absPath)) {
          findings.push({ level: 'error', message: `${relPath} is missing — reinstall ${moduleId}/${componentId}` });
          continue;
        }

        const content = readFileSync(absPath, 'utf8');
        const unresolved = findUnresolved(content, available.placeholders ?? {});
        for (const { token, key } of unresolved) {
          findings.push({
            level: 'error',
            key,
            message: `${relPath} still holds ${token} — the setup for "${key}" never finished`,
          });
        }

        if (record.hash === null) {
          findings.push({ level: 'warn', message: `${relPath} was skipped at install because it was edited locally` });
        }
      }
    }
  }

  // CLAUDE.md is written through markers rather than tracked as a file, so it
  // needs its own placeholder pass — this is exactly where `<Backlog Name>`
  // hides from the documented grep.
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf8');
    for (const module of modules) {
      if (!content.includes(`<!-- arachnid:${module.id} -->`)) continue;
      for (const { token, key } of findUnresolved(content, module.placeholders ?? {})) {
        findings.push({ level: 'error', key, message: `CLAUDE.md still holds ${token} — "${key}" was never answered` });
      }
    }
  }

  // Only the keys no file complained about: a placeholder already reported
  // file by file does not need a second, vaguer line saying the same thing.
  const reportedKeys = new Set(findings.map((finding) => finding.key).filter(Boolean));
  for (const key of manifest.unconfigured ?? []) {
    if (reportedKeys.has(key)) continue;
    findings.push({ level: 'warn', key, message: `"${key}" was left unconfigured — run Configure to set it` });
  }

  const { settings, error } = readSettings(projectRoot);
  if (error) {
    findings.push({ level: 'error', message: `.claude/settings.json is not valid JSON: ${error.message}` });
  } else {
    const granted = new Set(settings?.permissions?.allow ?? []);
    for (const { moduleId, componentId } of installed) {
      const entry = findComponent(modules, `${moduleId}/${componentId}`);
      for (const permission of entry?.component.settings?.permissions?.allow ?? []) {
        if (!granted.has(permission)) {
          findings.push({ level: 'warn', message: `permission not granted: ${permission} (${componentId} needs it)` });
        }
      }
    }
  }

  return { installed, findings, healthy: findings.every((f) => f.level === 'info') };
}
