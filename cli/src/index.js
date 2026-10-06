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
import {
  createBacklog,
  explainNotionError,
  isDataSourceUri,
  loadTicketPage,
  resolveDataSource,
  writeTicketPage,
} from './notion.js';
import { buildPlan } from './plan.js';
import { inspectProject } from './project.js';
import { pendingResolutions, planQuestions, questionCatalogue } from './questions.js';
import { orderSelection, resolveRequires } from './select.js';
import { relaunchInConsole } from './terminal.js';
import {
  componentOptions,
  dim,
  renderDiagnosis,
  renderPlan,
  renderQuestionPlan,
  renderState,
  reportLocked,
} from './ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI_VERSION = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version;

const ACTIONS = {
  'notion.createBacklog': runCreateBacklog,
  'notion.writeTicketPage': runWriteTicketPage,
};

/** What a question's `resolve.with` may name — the lookups that turn one answer into another. */
const RESOLVERS = {
  'notion.dataSource': resolveDataSourceAnswer,
};

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

/**
 * One question, with what it is for printed above it.
 *
 * A setup screen that asks « Commands that must pass before a push » and
 * nothing else is only answerable by whoever already knows. So every question
 * carries a `why` — one line, in the words of someone who has not read the
 * skill — and a `whenUnsure` when there is somewhere to go and look.
 */
async function askQuestion(question, position) {
  const context = [question.why, question.hint, question.whenUnsure && `Not sure? ${question.whenUnsure}`]
    .filter(Boolean);
  if (context.length) log.message(dim(context.join('\n')));

  const common = { message: `${position}  ${question.message ?? question.key}` };

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
      placeholder: question.example ?? '',
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
    const { viewsFailed, ...result } = await createBacklog({
      token: answers.notionToken,
      name: answers.backlogName,
      parentPageId: answers.notionParentPage,
      prefix: answers.ticketPrefix,
      onProgress: (message) => progress.message(message),
    });
    progress.stop(`Backlog created — ${result.dataSourceUri}`);
    if (viewsFailed.length) {
      const lines = viewsFailed.map((view) => `${view.name}: ${view.reason}`);
      log.warn(
        `Notion refused ${viewsFailed.length === 1 ? 'a view' : 'some views'} — the backlog is fine, ` +
          `add them by hand (notion-backlog/tools/README.md, step 8):\n  ${lines.join('\n  ')}`,
      );
    }
    return result;
  } catch (error) {
    progress.stop('Notion refused the call');
    throw error;
  }
}

/**
 * Create the « Writing a ticket » page, or bring it up to the shipped version.
 *
 * The decision of whether to overwrite is `planTicketPage`'s; this only asks
 * it, with the answer that decision says should be the default — yes for a page
 * this wizard wrote and that a newer version supersedes, no for a page it never
 * wrote, whose content overwriting would throw away.
 */
async function runWriteTicketPage(answers, { interactive } = {}) {
  const page = loadTicketPage();

  if (!answers.notionToken) {
    log.warn(`No Notion token given — the « ${page.title} » page was left alone.`);
    return {};
  }

  const progress = interactive ? spinner() : null;
  progress?.start('Talking to Notion');
  const say = (message) => (progress ? progress.message(message) : process.stdout.write(`${message}\n`));

  try {
    const result = await writeTicketPage({
      token: answers.notionToken,
      parentPageId: answers.notionParentPage,
      pageUrl: answers.ticketPageUrl,
      page,
      onProgress: say,
      confirm: async (decision) => {
        if (!interactive) return decision.defaultAnswer;

        // A spinner and a prompt cannot share the terminal: park it, ask, resume.
        progress.stop(decision.message);
        const answer = await confirm({
          message: `Update the Notion page « ${page.title} »?`,
          initialValue: decision.defaultAnswer,
        });
        progress.start('Talking to Notion');
        return isCancel(answer) ? false : answer;
      },
    });

    const OUTCOME = {
      created: `Page created — ${result.ticketPageUrl}`,
      updated: `Page updated to version ${result.version} — ${result.ticketPageUrl}`,
      skipped: result.decision?.message ?? 'Page left alone',
      declined: interactive
        ? 'Page left alone, as you asked'
        : `Page left alone — ${result.decision?.message ?? 'it needs a yes this run could not ask for'}`,
    };
    progress ? progress.stop(OUTCOME[result.outcome]) : process.stdout.write(`${OUTCOME[result.outcome]}\n`);

    return { ticketPageUrl: result.ticketPageUrl };
  } catch (error) {
    progress?.stop('Notion refused the call');
    throw error;
  }
}

/**
 * Work out every answer that comes from another one, once the questions are
 * over and before any action calls Notion.
 *
 * `planned` is every question of the run, so a resolver can re-ask its source
 * in the words the user already saw.
 */
async function runResolutions({ resolved, planned, answers, previousAnswers, given, catalogue, interactive }) {
  for (const question of pendingResolutions(resolved, { answers, previousAnswers, given })) {
    const resolver = RESOLVERS[question.resolve.with];
    if (!resolver) throw new Error(`Unknown resolver: ${question.resolve.with}`);
    await resolver(question, answers, { planned, catalogue, interactive });
  }
}

const RETRY = {
  token: 'Paste the token again',
  link: 'Paste another link',
  same: 'Try again',
};

/**
 * The data source URI, worked out from the link to the backlog.
 *
 * The URI is what the agent queries, and it is not in the link: Notion has to
 * be asked, with a token. The token is the one already given — asked for an
 * action on this run, or set as NOTION_TOKEN *before* the wizard started — and
 * otherwise asked for here, right before the one call that needs it.
 *
 * Nobody is left stuck on a failure: they can try again once the page is
 * shared, type the URI themselves, or leave it for later, which leaves the
 * placeholder for the plan and `doctor` to point at.
 */
async function resolveDataSourceAnswer(question, answers, { planned, catalogue, interactive }) {
  const { key } = question;
  const from = question.resolve.from;
  const source = planned.find((q) => q.key === from) ?? { key: from, ...catalogue[from] };
  const tokenQuestion = { key: 'notionToken', ...catalogue.notionToken };
  const report = (message) => process.stdout.write(`${message}\n`);

  // Whatever was stored was worked out from another link.
  delete answers[key];

  let link = answers[from];
  // The token question is only planned when an action needs it — the
  // environment counts all the same when only this lookup does.
  let token = answers[tokenQuestion.key] ?? (tokenQuestion.env && process.env[tokenQuestion.env]) ?? undefined;

  for (;;) {
    if (isDataSourceUri(link)) {
      // The URI itself, pasted where the link was asked: nothing to look up.
      answers[key] = link.trim();
      delete answers[from];
      if (interactive && !source.onlyToResolve) {
        log.info('That is the data source URI itself — kept as it is. The rules also link to the backlog, for whoever reads them:');
        const again = await askQuestion(source, dim('↳'));
        if (again && !isDataSourceUri(again)) answers[from] = again;
      }
      return;
    }

    if (!token) {
      if (!interactive) {
        report(`not resolved: ${key} — no Notion token. Set NOTION_TOKEN, or pass --set ${key}=collection://…`);
        return;
      }
      token = await askToken(tokenQuestion);
      if (!token) return askDataSourceByHand(question, answers, link);
      answers[tokenQuestion.key] = token;
    }

    const progress = interactive ? spinner() : null;
    progress?.start('Asking Notion for the data source of your backlog');

    let found;
    try {
      found = await resolveDataSource(token, link);
      progress?.stop(`Found « ${found.title} »`);
    } catch (error) {
      progress?.stop('Notion could not answer');
      const advice = explainNotionError(error);
      if (!interactive) {
        report(`not resolved: ${key} — ${advice.message}`);
        return;
      }

      log.warn(advice.message);
      const next = stopIfCancelled(
        await select({
          message: 'What now?',
          options: [
            { value: 'retry', label: RETRY[advice.retry] },
            { value: 'by-hand', label: 'Type the collection:// URI myself' },
            { value: 'later', label: 'Leave it for later', hint: 'Configure fills it in — doctor points at it until then' },
          ],
        }),
      );
      if (next === 'by-hand') return askDataSourceByHand(question, answers, link);
      if (next === 'later') return;

      if (advice.retry === 'token') {
        token = undefined;
        delete answers[tokenQuestion.key];
      }
      if (advice.retry === 'link') {
        link = await askQuestion(source, dim('↳'));
        if (!link) return;
        answers[from] = link;
      }
      continue;
    }

    const chosen = found.dataSources.length === 1
      ? found.dataSources[0]
      : await pickDataSource(found, { interactive, report, key });
    if (!chosen) return;

    answers[key] = chosen.uri;
    interactive ? log.success(`${question.message}: ${chosen.uri}`) : report(`resolved: ${key} = ${chosen.uri}`);
    return;
  }
}

/** A database with more than one data source: which one holds the tickets is the user's call. */
async function pickDataSource(found, { interactive, report, key }) {
  if (!interactive) {
    const names = found.dataSources.map((ds) => `${ds.name} → ${ds.uri}`).join(', ');
    report(`not resolved: ${key} — « ${found.title} » has several data sources (${names}); pass --set ${key}=…`);
    return null;
  }
  const uri = stopIfCancelled(
    await select({
      message: `« ${found.title} » has several data sources — which one holds the tickets?`,
      options: found.dataSources.map((ds) => ({ value: ds.uri, label: ds.name, hint: ds.uri })),
    }),
  );
  return found.dataSources.find((ds) => ds.uri === uri);
}

/**
 * The token, asked for the lookup that needs it — and only then.
 *
 * An environment variable set once the wizard is running never reaches it, so
 * this is the one moment it can still be given. Left empty, the user is shown
 * the way that needs no token at all.
 */
async function askToken(tokenQuestion) {
  const context = [
    'The link does not hold the data source: Notion has to be asked for it, with an integration token.',
    tokenQuestion.why,
    tokenQuestion.whenUnsure && `Not sure? ${tokenQuestion.whenUnsure}`,
    'No token? Leave it empty — there is another way.',
  ].filter(Boolean);
  log.message(dim(context.join('\n')));
  const token = stopIfCancelled(await password({ message: tokenQuestion.message ?? tokenQuestion.key }));
  return token?.trim() || undefined;
}

async function askDataSourceByHand(question, answers, link) {
  const context = [question.why, question.whenUnsure && `Not sure? ${question.whenUnsure}`, link && `Your link: ${link}`]
    .filter(Boolean);
  log.message(dim(context.join('\n')));

  const value = stopIfCancelled(
    await text({
      message: question.message ?? question.key,
      placeholder: question.example ?? '',
      defaultValue: '',
      validate: (input) =>
        !input || isDataSourceUri(input) ? undefined : 'A data source URI starts with collection:// — or leave it empty.',
    }),
  );
  if (value) answers[question.key] = value.trim();
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

  const { questions, derived, resolved, fromEnv, all, provided } = planQuestions(selection, {
    projectRoot: project.root,
    previousAnswers: manifest.answers,
  });

  // `update` runs on what was already answered; `install` and `configure` ask.
  // A question with no stored answer is always asked, whatever the verb —
  // otherwise a component added later would install with an empty placeholder.
  const toAsk = verb === 'update'
    ? questions.filter((q) => manifest.answers?.[q.key] === undefined && q.default === undefined)
    : questions;

  renderQuestionPlan(toAsk, { provided, derived, resolved, fromEnv });

  const answers = { ...manifest.answers, ...options.answers };
  for (const question of fromEnv) answers[question.key] ??= process.env[question.env];
  for (const [index, question] of toAsk.entries()) {
    if (options.answers[question.key] !== undefined) continue;
    const value = await askQuestion(question, dim(`${index + 1}/${toAsk.length}`));
    if (value !== '' && value !== undefined) answers[question.key] = value;
  }
  for (const question of all) {
    if (answers[question.key] === undefined && question.default !== undefined) {
      answers[question.key] = question.default;
    }
  }

  await runResolutions({
    resolved,
    planned: all,
    answers,
    previousAnswers: manifest.answers,
    given: options.answers,
    catalogue,
    interactive: true,
  });

  for (const { component } of selection) {
    if (!component.action) continue;
    const action = ACTIONS[component.action];
    if (!action) throw new Error(`Unknown action: ${component.action}`);
    Object.assign(answers, await action(answers, { interactive: true }));
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

  const { written, removed, skipped } = applyPlan({
    projectRoot: project.root,
    plan,
    selection,
    answers,
    manifest,
    questionCatalogue: catalogue,
    cliVersion: CLI_VERSION,
  });

  log.success(`${written.length} file${written.length === 1 ? '' : 's'} written.`);
  if (removed.length) {
    log.info(`${removed.map((c) => c.path).join(', ')} held nothing but our block and was removed.`);
  }
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

  if (!options.yes) {
    const status = relaunchInConsole();
    if (status !== null) {
      process.exitCode = status;
      return;
    }
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
  const { all, resolved, fromEnv } = planQuestions(selection, {
    projectRoot: project.root,
    previousAnswers: manifest.answers,
  });

  const answers = { ...manifest.answers, ...options.answers };
  for (const question of fromEnv) answers[question.key] ??= process.env[question.env];
  for (const question of all) {
    if (answers[question.key] === undefined && question.default !== undefined) {
      answers[question.key] = question.default;
    }
  }

  await runResolutions({
    resolved,
    planned: all,
    answers,
    previousAnswers: manifest.answers,
    given: options.answers,
    catalogue,
    interactive: false,
  });

  for (const { component } of selection) {
    if (!component.action) continue;
    Object.assign(answers, await ACTIONS[component.action](answers, { interactive: false }));
  }

  const plan = buildPlan({ projectRoot: project.root, selection, answers, manifest });
  const { written, removed, skipped } = applyPlan({
    projectRoot: project.root,
    plan,
    selection,
    answers,
    manifest,
    questionCatalogue: catalogue,
    cliVersion: CLI_VERSION,
  });

  for (const change of written) process.stdout.write(`written: ${change.path}\n`);
  for (const change of removed) process.stdout.write(`removed: ${change.path}\n`);
  for (const change of skipped) process.stdout.write(`skipped (edited locally): ${change.path}\n`);
  for (const change of plan.kept) process.stdout.write(`kept (yours): ${change.path}\n`);
  for (const key of plan.deferred) process.stdout.write(`not recorded yet: ${key}\n`);
  for (const item of plan.unresolved) {
    process.stdout.write(`unconfigured: ${item.key} in ${item.path}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
});
