import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function isGitRepo(cwd) {
  return git(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

export function currentBranch(cwd) {
  return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

/**
 * The branch pull requests target. `origin/HEAD` is the honest answer when the
 * remote publishes one; otherwise we fall back to a branch that exists, and
 * only then to the conventional name.
 */
export function baseBranch(cwd) {
  const head = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) return head.replace(/^origin\//, '');

  for (const candidate of ['main', 'master']) {
    if (git(cwd, ['rev-parse', '--verify', '--quiet', candidate])) return candidate;
  }
  return currentBranch(cwd) ?? 'main';
}

export function packageScripts(cwd) {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')).scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * A plausible "commands that must pass before a push", built from the scripts
 * the project actually declares. Suggested, never imposed — the wizard shows it
 * as a default the user edits.
 */
export function suggestLocalChecks(cwd) {
  const scripts = packageScripts(cwd);
  const wanted = ['lint', 'typecheck', 'test'];
  const found = wanted.filter((name) => scripts[name]).map((name) => `npm run ${name}`);
  return found.length ? found.join(' && ') : '';
}

export function suggestCoverageCommand(cwd) {
  const scripts = packageScripts(cwd);
  for (const name of ['coverage', 'test:coverage']) {
    if (scripts[name]) return `npm run ${name}`;
  }
  return '';
}

/** Everything screen 0 shows about where we are running. */
export function inspectProject(cwd) {
  return {
    root: cwd,
    isGit: isGitRepo(cwd),
    branch: currentBranch(cwd),
    baseBranch: baseBranch(cwd),
    hasClaudeDir: existsSync(join(cwd, '.claude')),
    hasClaudeMd: existsSync(join(cwd, 'CLAUDE.md')),
  };
}
