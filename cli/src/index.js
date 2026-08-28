#!/usr/bin/env node
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cancel,
  confirm,
  groupMultiselect,
  intro,
  isCancel,
  log,
  outro,
  password,
  select,
  spinner,
  text,
} from '@clack/prompts';

import { applyPlan } from './apply.js';
import { helpText, parseArgs, VERBS } from './args.js';
import { diagnose } from './doctor.js';
import { discoverModules, findComponent } from './modules.js';
import {
  forgetComponent,
  installedComponents,
  readManifest,
  writeManifest,
} from './manifest.js';
import { createBacklog } from './notion.js';
import { buildPlan } from './plan.js';
import { inspectProject } from './project.js';
import { planQuestions, questionCatalogue } from './questions.js';
import { orderSelection, resolveRequires } from './select.js';
import {
  componentOptions,
  renderDiagnosis,
  renderPlan,
  renderQuestionPlan,
  renderState,
  reportLocked,
} from './ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI_VERSION = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version;

const ACTIONS = { 'notion.createBacklog': runCreateBacklog };

function stopIfCancelled(value) {
  if (isCancel(value)) {
    cancel('Nothing was written.');
    process.exit(0);
  }
  return value;
}

async function chooseVerb(manifest) {
  const hasInstall = installedComponents(manifest).length > 0;

  const options = [{ value: 'install', label: 'Install', hint: 'add components to this project' }];
  if (hasInstall) {
    options.push(
      { value: 'update', label: 'Update', hint: 'refresh installed components' },
      { value: 'configure', label: 'Configure', hint: 'change answers without touching versions' },
      { value: 'remove', label: 'Remove', hint: 'take components out' },
      { value: 'doctor', label: 'Doctor', hint: 'check the installation is complete' },
    );
  }

  // Nothing installed means nothing to update, configure, remove or diagnose:
  // one option is not a menu, so we go straight in.
  if (options.length === 1) return 'install';

  return stopIfCancelled(await select({ message: 'What would you like to do?', options }));
}

async function chooseComponents({ modules, manifest, only, initial }) {
  const installedKeys = installedComponents(manifest);
  const groups = componentOptions({ modules, installedKeys, only });

  if (Object.values(groups).flat().length === 0) {
    log.warn('No component available for this action.');
    return [];
  }

  return stopIfCancelled(
    await groupMultiselect({
      message: 'Which components?',
      options: groups,
      initialValues: initial ?? [],
      required: false,
    }),
  );
}

async function askQuestion(question) {
  const common = { message: question.message ?? question.key };
  if (question.hint) common.placeholder = question.hint;

  if (question.type === 'select') {
    return stopIfCancelled(
      await select({
        ...common,
        options: (question.options ?? []).map((value) => ({ value, label: value })),
        initialValue: question.default,
      }),
    );
  }

  if (question.type === 'password') {
    return stopIfCancelled(await password(common));
  }

  const answer = stopIfCancelled(
    await text({
      ...common,
      placeholder: question.example ?? question.hint ?? '',
      initialValue: question.default ?? '',
      defaultValue: '',
    }),
  );
  return answer;
}

async function runCreateBacklog(answers) {
  const progress = spinner();
  progress.start('Talking to Notion');

  try {
    const result = await createBacklog({
      token: answers.notionToken,
      name: answers.backlogName,
      parentPageId: answers.notionParentPage,
      prefix: answers.ticketPrefix,
      onProgress: (message) => progress.message(message),
    });
    progress.stop(`Backlog created — ${result.dataSourceUri}`);
    return result;
  } catch (error) {
    progress.stop('Notion refused the call');
    throw error;
  }
}

async function runWriteVerb({ verb, modules, project, manifest, options }) {
  const installedKeys = installedComponents(manifest);
  const restrictTo = verb === 'install' ? null : installedKeys;

  let keys = options.components.length
    ? options.components
    : await chooseComponents({
        modules,
        manifest,
        only: restrictTo,
        initial: verb === 'install' ? installedKeys : installedKeys,
      });

  if (!keys.length) {
    log.info('Nothing selected.');
    return;
  }

  for (const key of keys) {
    if (!findComponent(modules, key)) throw new Error(`Unknown component: ${key}`);
  }

  const { keys: expanded, locked } = resolveRequires(modules, keys);
  reportLocked(locked, modules);

  const selection = orderSelection(modules, expanded);
  const catalogue = questionCatalogue(modules);

  const { questions, provided } = planQuestions(selection, {
    projectRoot: project.root,
    previousAnswers: manifest.answers,
  });

  // `update` runs on what was already answered; `install` and `configure` ask.
  // A question with no stored answer is always asked, whatever the verb —
  // otherwise a component added later would install with an empty placeholder.
  const toAsk = verb === 'update'
    ? questions.filter((q) => manifest.answers?.[q.key] === undefined && q.default === undefined)
    : questions;

  if (toAsk.length) renderQuestionPlan(toAsk, provided);

  const answers = { ...manifest.answers, ...options.answers };
  for (const question of toAsk) {
    if (options.answers[question.key] !== undefined) continue;
    const value = await askQuestion(question);
    if (value !== '' && value !== undefined) answers[question.key] = value;
  }
  for (const question of questions) {
    if (answers[question.key] === undefined && question.default !== undefined) {
      answers[question.key] = question.default;
    }
  }

  for (const { component } of selection) {
    if (!component.action) continue;
    const action = ACTIONS[component.action];
    if (!action) throw new Error(`Unknown action: ${component.action}`);
    Object.assign(answers, await action(answers));
  }

  const plan = buildPlan({ projectRoot: project.root, selection, answers, manifest });
  renderPlan(plan);

  if (plan.nothingToDo) {
    outro('Already up to date.');
    return;
  }

  const go = stopIfCancelled(await confirm({ message: 'Apply these changes?', initialValue: true }));
  if (!go) {
    cancel('Nothing was written.');
    return;
  }

  const { written, skipped } = applyPlan({
    projectRoot: project.root,
    plan,
    selection,
    answers,
    manifest,
    questionCatalogue: catalogue,
    cliVersion: CLI_VERSION,
  });

  log.success(`${written.length} file${written.length === 1 ? '' : 's'} written.`);
  if (skipped.length) {
    log.warn(`${skipped.length} left alone because you had edited them: ${skipped.map((c) => c.path).join(', ')}`);
  }
  if (plan.unresolved.length) {
    log.warn('Run `arachnid-mesh doctor` to see what is still unconfigured.');
  }

  outro('Done. Start an iteration with /go when you are ready.');
}

async function runRemove({ modules, project, manifest, options }) {
  const keys = options.components.length
    ? options.components
    : await chooseComponents({ modules, manifest, only: installedComponents(manifest), initial: [] });

  if (!keys.length) {
    log.info('Nothing selected.');
    return;
  }

  const paths = [];
  for (const key of keys) {
    const [moduleId, componentId] = key.split('/');
    const record = manifest.modules?.[moduleId]?.components?.[componentId];
    for (const relPath of Object.keys(record?.files ?? {})) paths.push(relPath);
  }

  renderPlan({
    changes: paths.map((path) => ({ kind: 'file', action: 'skip-edited', path, mode: 'to delete' })),
    unresolved: [],
  });

  const go = stopIfCancelled(
    await confirm({ message: `Delete ${paths.length} file(s)?`, initialValue: false }),
  );
  if (!go) {
    cancel('Nothing was removed.');
    return;
  }

  for (const relPath of paths) {
    const absPath = join(project.root, relPath);
    if (existsSync(absPath)) rmSync(absPath, { force: true });
  }
  for (const key of keys) {
    const [moduleId, componentId] = key.split('/');
    forgetComponent(manifest, moduleId, componentId);
  }
  writeManifest(project.root, manifest);

  log.info('Permissions in .claude/settings.json were left in place — remove them by hand if you want them gone.');
  outro(`${paths.length} file(s) removed.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (options.version) {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }
  if (options.verb && !VERBS.includes(options.verb)) {
    throw new Error(`Unknown verb: ${options.verb}`);
  }

  const modules = discoverModules();
  if (!modules.length) throw new Error('No module found next to this CLI.');

  const project = inspectProject(options.projectRoot);
  const manifest = readManifest(project.root);

  if (options.yes) {
    return runHeadless({ modules, project, manifest, options });
  }

  intro('ArachnidMesh');
  renderState({ project, modules, manifest, cliVersion: CLI_VERSION });

  if (!project.isGit) {
    log.warn('This is not a git repository. The /go skill branches and opens pull requests, so it needs one.');
  }

  const verb = options.verb ?? (await chooseVerb(manifest));

  if (verb === 'doctor') {
    renderDiagnosis(diagnose({ projectRoot: project.root, modules, manifest }));
    outro('Nothing was written.');
    return;
  }
  if (verb === 'remove') return runRemove({ modules, project, manifest, options });
  return runWriteVerb({ verb, modules, project, manifest, options });
}

/** No prompts, no confirmation — for CI, and for the agents that run this. */
async function runHeadless({ modules, project, manifest, options }) {
  const verb = options.verb ?? 'install';

  if (verb === 'doctor') {
    const result = diagnose({ projectRoot: project.root, modules, manifest });
    for (const finding of result.findings) {
      process.stdout.write(`${finding.level}: ${finding.message}\n`);
    }
    process.exitCode = result.findings.some((f) => f.level === 'error') ? 1 : 0;
    return;
  }

  const keys = options.components.length ? options.components : installedComponents(manifest);
  if (!keys.length) throw new Error('--yes needs --component, or something already installed.');

  const { keys: expanded } = resolveRequires(modules, keys);
  const selection = orderSelection(modules, expanded);
  const catalogue = questionCatalogue(modules);
  const { questions } = planQuestions(selection, {
    projectRoot: project.root,
    previousAnswers: manifest.answers,
  });

  const answers = { ...manifest.answers, ...options.answers };
  for (const question of questions) {
    if (answers[question.key] === undefined && question.default !== undefined) {
      answers[question.key] = question.default;
    }
  }

  for (const { component } of selection) {
    if (!component.action) continue;
    Object.assign(answers, await ACTIONS[component.action](answers));
  }

  const plan = buildPlan({ projectRoot: project.root, selection, answers, manifest });
  const { written, skipped } = applyPlan({
    projectRoot: project.root,
    plan,
    selection,
    answers,
    manifest,
    questionCatalogue: catalogue,
    cliVersion: CLI_VERSION,
  });

  for (const change of written) process.stdout.write(`written: ${change.path}\n`);
  for (const change of skipped) process.stdout.write(`skipped (edited locally): ${change.path}\n`);
  for (const item of plan.unresolved) {
    process.stdout.write(`unconfigured: ${item.key} in ${item.path}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
});
