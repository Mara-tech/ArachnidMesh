import { log, note } from '@clack/prompts';

const SYMBOL = { create: '+', update: '~', delete: '-', 'skip-edited': '!', kept: '·', unchanged: '=' };

export const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** Screen 0 — what we found before anything is proposed. */
export function renderState({ project, modules, manifest, cliVersion }) {
  const lines = [
    `${bold('ArachnidMesh')} ${cliVersion}`,
    `${dim('project')}  ${project.root}`,
    `${dim('git')}      ${project.isGit ? `${project.branch} ${dim(`(base: ${project.baseBranch})`)}` : dim('not a git repository')}`,
    `${dim('code')}     ${describeStack(project)}`,
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

/**
 * What the project itself answers, so the screen can say it out loud.
 *
 * Someone starting a project has no build file to read a test command off, and
 * being told that is the difference between a wizard that skipped a question
 * and one that seems to have forgotten it.
 */
function describeStack(project) {
  if (project?.stack) return `${project.stack.label} ${dim(`(${project.stack.manifest})`)}`;
  if (project?.hasCode) return dim('no build file recognised');
  return dim('nothing yet — a project about to start');
}

/** Screen 2 — what will be asked, what is not asked, and why. */
export function renderQuestionPlan(questions, { provided = [], derived = [] } = {}) {
  const blocks = [];

  if (questions.length) {
    blocks.push(questions.map((q, index) => `${index + 1}. ${q.message ?? q.key}`).join('\n'));
  } else {
    blocks.push('Nothing to ask — everything is already answered.');
  }

  // The questions that are *not* asked matter as much as the ones that are: a
  // test command is read off the project, and when there is nothing to read,
  // the file that wanted it says so and the first iteration to learn it fills
  // it in. Silence here reads as an omission.
  if (derived.length) {
    const lines = derived.map((q) => {
      const value = q.default ? `\`${q.default}\`` : 'not recorded yet — the project fills it in as it learns';
      return `  ${q.message ?? q.key}: ${value}`;
    });
    blocks.push(dim(['Read from your project, not asked:', ...lines].join('\n')));
  }

  if (provided.length) {
    blocks.push(dim(`Produced by a selected action, not asked: ${provided.join(', ')}`));
  }

  blocks.push(dim('Every answer can be changed later — run the wizard again and pick Configure.'));

  const title = questions.length
    ? `${questions.length} question${questions.length === 1 ? '' : 's'}`
    : 'Questions';
  note(blocks.join('\n\n'), title);
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
          ? dim(change.legacy ? 'arachnid block moved to .claude/CLAUDE.md' : 'arachnid block')
          : change.action === 'skip-edited'
            ? '\x1b[33medited locally — left alone\x1b[0m'
            : change.action === 'kept'
              ? dim('yours since the install — left as it is')
              : dim(change.mode ?? '');
    return ` ${symbol}  ${change.path.padEnd(width)}  ${detail}`;
  });

  note(lines.join('\n'), 'About to write');

  if (plan.deferred?.length) {
    log.info(
      `Not recorded yet: ${plan.deferred.join(', ')}. The files say so in as many words — ` +
        'the first iteration that learns the answer writes it in.',
    );
  }

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
