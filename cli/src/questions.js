import { baseBranch, currentBranch, suggestCoverageCommand, suggestLocalChecks } from './project.js';

/**
 * Named default resolvers.
 *
 * A module declares `"default": "git.baseBranch"` — a key in this table, not an
 * expression to evaluate. A module manifest is data; giving it an evaluator
 * would make every module a piece of code the CLI runs.
 */
const RESOLVERS = {
  'git.baseBranch': (ctx) => baseBranch(ctx.projectRoot),
  'git.currentBranch': (ctx) => currentBranch(ctx.projectRoot),
  'stack.localChecks': (ctx) => suggestLocalChecks(ctx.projectRoot),
  'stack.coverage': (ctx) => suggestCoverageCommand(ctx.projectRoot),
};

export function resolveDefault(spec, ctx) {
  if (spec === undefined || spec === null) return undefined;
  if (typeof spec !== 'string') return spec;
  const resolver = RESOLVERS[spec];
  if (!resolver) return spec; // a literal default
  try {
    return resolver(ctx) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The questions to ask for a selection — the union of what the selected
 * components need, each asked once.
 *
 * A question marked `derived` is never put to the user. « Which command runs
 * the tests? » is the project's answer, not the user's: it is read off the
 * build file when there is one, and left empty when there is not — the file it
 * seeds then says « not recorded yet » and names who fills it in. Asking it at
 * install time asks someone starting a project to describe a build they have
 * not written yet.
 *
 * This is what selecting first buys: `dataSourceUri` is needed by /go and by
 * the ticket rules, and is asked once rather than twice. Anything a selected
 * component *provides* is dropped — ticking "create the Notion database" means
 * the data source URI will come from the call, so asking for it would be asking
 * the user for something they came here to obtain.
 *
 * Two more kinds of question are not put to the user:
 *
 *   - one that declares `resolve` is worked out from another answer — the data
 *     source URI from the link to the backlog. The link is what anyone can copy
 *     out of the address bar; the URI is not in it, and asking for it is asking
 *     for a lookup. So the link is asked in its place, and the CLI does the
 *     lookup once the questions are over (`resolved`).
 *   - one that declares `env` is taken from that environment variable when it
 *     is set (`fromEnv`). Only the value the process started with counts: a
 *     variable set elsewhere once the wizard is running never reaches it.
 */
export function planQuestions(selection, ctx) {
  const env = ctx.env ?? process.env;
  const provided = new Set();
  for (const { component } of selection) {
    for (const key of component.provides ?? []) provided.add(key);
  }

  const seen = new Set();
  const questions = [];
  const derived = [];
  const resolved = [];
  const fromEnv = [];

  const plan = (module, key, askedFor) => {
    if (seen.has(key) || provided.has(key)) return;
    seen.add(key);

    const definition = module.questions?.[key];
    if (!definition) return;

    const question = {
      key,
      module: module.id,
      ...definition,
      default: ctx.previousAnswers?.[key] ?? resolveDefault(definition.default, ctx),
      askedFor,
    };

    if (definition.resolve) {
      question.sourceMessage = module.questions?.[definition.resolve.from]?.message ?? definition.resolve.from;
      resolved.push(question);
      plan(module, definition.resolve.from, componentsNeeding(selection, definition.resolve.from));
    } else if (definition.env && env[definition.env]) {
      fromEnv.push(question);
    } else {
      (question.derived ? derived : questions).push(question);
    }
  };

  for (const { module, component } of selection) {
    for (const key of component.needs ?? []) plan(module, key, componentsNeeding(selection, key));
  }

  // A source asked only so that another answer can be worked out from it is
  // asked *for* the components that need that other answer, and marked: when
  // the user pastes the URI itself there, nothing else wants the link, so it
  // is not asked for a second time.
  for (const question of resolved) {
    const source = questions.find((q) => q.key === question.resolve.from);
    if (source && !source.askedFor.length) {
      source.askedFor = question.askedFor;
      source.onlyToResolve = true;
    }
  }

  return {
    questions,
    derived,
    resolved,
    fromEnv,
    all: [...questions, ...derived, ...resolved, ...fromEnv],
    provided: [...provided],
  };
}

/**
 * The resolved questions that need working out on this run.
 *
 * Nothing to do when the value was given outright (`--set`), when there is no
 * source to work from, or when the source is the one the stored value was
 * worked out from — a configure that keeps the same link does not call Notion
 * again. A source that changed makes the stored value stale, so it is looked
 * up again rather than kept.
 */
export function pendingResolutions(resolved, { answers, previousAnswers = {}, given = {} }) {
  return resolved.filter((question) => {
    if (given[question.key] !== undefined) return false;

    const source = answers[question.resolve.from];
    if (!source) return false;

    const stored = answers[question.key];
    return !stored || source !== previousAnswers[question.resolve.from];
  });
}

function componentsNeeding(selection, key) {
  return selection
    .filter(({ component }) => (component.needs ?? []).includes(key))
    .map(({ component }) => component.label ?? component.id);
}

/** Question definitions across the selected modules, for secret filtering. */
export function questionCatalogue(modules) {
  const catalogue = {};
  for (const module of modules) {
    for (const [key, definition] of Object.entries(module.questions ?? {})) {
      catalogue[key] ??= definition;
    }
  }
  return catalogue;
}
