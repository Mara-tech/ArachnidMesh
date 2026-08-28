import { log, note } from '@clack/prompts';

const SYMBOL = { create: '+', update: '~', 'skip-edited': '!', unchanged: '=' };

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** Screen 0 — what we found before anything is proposed. */
export function renderState({ project, modules, manifest, cliVersion }) {
  const lines = [
    `${bold('ArachnidMesh')} ${cliVersion}`,
    `${dim('project')}  ${project.root}`,
    `${dim('git')}      ${project.isGit ? `${project.branch} ${dim(`(base: ${project.baseBranch})`)}` : dim('not a git repository')}`,
  ];

  const installed = Object.entries(manifest.modules ?? {});
  if (installed.length === 0) {
    lines.push(`${dim('installed')} ${dim('nothing yet')}`);
  } else {
    for (const [moduleId, mod] of installed) {
      const available = modules.find((m) => m.id === moduleId);
      const components = Object.keys(mod.components ?? {}).join(', ');
      const upgrade = available && available.version !== mod.version
        ? `  ⬆ ${available.version} available`
        : '';
      lines.push(`${dim('installed')} ${moduleId} ${mod.version}  ${dim(components)}${upgrade}`);
    }
  }

  note(lines.join('\n'), 'State');
}

/** Screen 1 — options for a grouped multi-select, module by module. */
export function componentOptions({ modules, installedKeys, only }) {
  const groups = {};

  for (const module of modules) {
    const entries = [];
    for (const component of module.components) {
      const key = `${module.id}/${component.id}`;
      if (only && !only.includes(key)) continue;

      const marks = [];
      if (installedKeys.includes(key)) marks.push('installed');
      if (component.warning) marks.push(`⚠ ${component.warning}`);

      entries.push({
        value: key,
        label: `${component.label ?? component.id}${component.kind ? dim(`  ${component.kind}`) : ''}`,
        hint: [component.description, ...marks].filter(Boolean).join(' · '),
      });
    }
    if (entries.length) groups[module.name ?? module.id] = entries;
  }

  return groups;
}

export function reportLocked(locked, modules) {
  if (!locked.length) return;
  const labels = locked.map((key) => {
    const [, componentId] = key.split('/');
    return componentId;
  });
  log.info(`Pulled in as dependencies: ${labels.join(', ')}`);
}

/** Screen 2 — what will be asked, and why. */
export function renderQuestionPlan(questions, provided) {
  const lines = questions.map((q) => {
    const askedFor = q.askedFor?.length > 1 ? dim(`  (needed by ${q.askedFor.join(' and ')})`) : '';
    return `${q.key}${askedFor}`;
  });

  if (provided.length) {
    lines.push(dim(`skipped, produced by a selected action: ${provided.join(', ')}`));
  }

  note(lines.join('\n'), `${questions.length} question${questions.length === 1 ? '' : 's'}`);
}

/** Screen 3 — the diff, before a single byte is written. */
export function renderPlan(plan) {
  const shown = plan.changes.filter((c) => c.action !== 'unchanged');

  if (!shown.length) {
    note('Everything is already in place.', 'Nothing to write');
    return;
  }

  const width = Math.max(...shown.map((c) => c.path.length));
  const lines = shown.map((change) => {
    const symbol = SYMBOL[change.action] ?? '?';
    const detail =
      change.kind === 'settings'
        ? `+${change.added.length} permission${change.added.length === 1 ? '' : 's'} ${dim('(yours kept)')}`
        : change.kind === 'claudeMd'
          ? dim('arachnid block')
          : change.action === 'skip-edited'
            ? '\x1b[33medited locally — left alone\x1b[0m'
            : dim(change.mode ?? '');
    return ` ${symbol}  ${change.path.padEnd(width)}  ${detail}`;
  });

  note(lines.join('\n'), 'About to write');

  if (plan.unresolved.length) {
    const byKey = new Map();
    for (const item of plan.unresolved) {
      byKey.set(item.key, [...(byKey.get(item.key) ?? []), item.path]);
    }
    const lines = [...byKey.entries()].map(([key, paths]) => `${key} — ${paths.join(', ')}`);
    log.warn(`Left unfilled, the skill will stop rather than guess:\n  ${lines.join('\n  ')}`);
  }
}

export function renderDiagnosis({ installed, findings }) {
  if (installed.length) {
    note(installed.map((c) => `${c.moduleId}/${c.componentId}  ${dim(c.label)}`).join('\n'), 'Installed');
  } else {
    note('Nothing installed in this project.', 'Installed');
  }

  if (!findings.length) {
    log.success('No problem found.');
    return;
  }

  for (const finding of findings) {
    if (finding.level === 'error') log.error(finding.message);
    else if (finding.level === 'warn') log.warn(finding.message);
    else log.info(finding.message);
  }
}
