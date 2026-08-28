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
  'pkg.localChecks': (ctx) => suggestLocalChecks(ctx.projectRoot),
  'pkg.coverage': (ctx) => suggestCoverageCommand(ctx.projectRoot),
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
 * This is what selecting first buys: `dataSourceUri` is needed by /go and by
 * the ticket rules, and is asked once rather than twice. Anything a selected
 * component *provides* is dropped — ticking "create the Notion database" means
 * the data source URI will come from the call, so asking for it would be asking
 * the user for something they came here to obtain.
 */
export function planQuestions(selection, ctx) {
  const provided = new Set();
  for (const { component } of selection) {
    for (const key of component.provides ?? []) provided.add(key);
  }

  const seen = new Set();
  const questions = [];

  for (const { module, component } of selection) {
    for (const key of component.needs ?? []) {
      if (seen.has(key) || provided.has(key)) continue;
      seen.add(key);

      const definition = module.questions?.[key];
      if (!definition) continue;

      questions.push({
        key,
        module: module.id,
        ...definition,
        default: ctx.previousAnswers?.[key] ?? resolveDefault(definition.default, ctx),
        askedFor: componentsNeeding(selection, key),
      });
    }
  }

  return { questions, provided: [...provided] };
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
