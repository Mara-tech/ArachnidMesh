import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { persistableAnswers, recordComponent, writeManifest } from './manifest.js';

/**
 * Write a plan that has already been shown and accepted.
 *
 * Everything was computed in memory by buildPlan, so this only writes — there
 * is no decision left to take here, and nothing that can half-fail on a
 * question the user was never asked.
 */
export function applyPlan({ projectRoot, plan, selection, answers, manifest, questionCatalogue, cliVersion }) {
  const written = [];

  for (const change of plan.changes) {
    if (change.action !== 'create' && change.action !== 'update') continue;
    const absPath = join(projectRoot, change.path);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, change.content, 'utf8');
    written.push(change);
  }

  // The manifest records the hash of what we wrote, per component, so the next
  // run can tell an out-of-date file from one the user edited.
  const byComponent = new Map();
  for (const change of plan.changes) {
    if (change.kind !== 'file') continue;
    const key = `${change.moduleId}/${change.componentId}`;
    const files = byComponent.get(key) ?? {};
    files[change.path] = { mode: change.mode, hash: change.action === 'skip-edited' ? null : change.hash };
    byComponent.set(key, files);
  }

  for (const { module, component } of selection) {
    const files = byComponent.get(`${module.id}/${component.id}`) ?? {};
    recordComponent(manifest, module.id, module.version, component.id, files);
  }

  manifest.cli = cliVersion;
  manifest.answers = { ...manifest.answers, ...persistableAnswers(answers, questionCatalogue) };
  manifest.unconfigured = [...new Set(plan.unresolved.map((item) => item.key))];

  writeManifest(projectRoot, manifest);

  return { written, skipped: plan.skipped };
}
