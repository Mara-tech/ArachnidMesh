import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CLAUDE_MD_PATH, LEGACY_CLAUDE_MD_PATH } from './plan.js';

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
 * The stacks we can read a build file of, and what they run.
 *
 * This table exists so the wizard stops asking a question the project can
 * answer. « Which command runs the tests? » is obvious to whoever wrote the
 * build file and opaque to everyone else — and it is written down, in the
 * repository, in a file we can open.
 *
 * A suggestion is only made when the build file actually shows it. `mvn verify`
 * is a safe reading of a `pom.xml`; a coverage command is not, unless the
 * plugin that produces one is declared — so coverage is looked up by marker and
 * left empty when the marker is absent. An empty suggestion is the honest
 * answer, and the question that carries it says so.
 */
const STACKS = [
  {
    id: 'node',
    label: 'Node',
    manifests: ['package.json'],
    checks: (cwd) => {
      const scripts = packageScripts(cwd);
      const found = ['lint', 'typecheck', 'test'].filter((name) => scripts[name]);
      return found.map((name) => `npm run ${name}`).join(' && ');
    },
    coverage: (cwd) => {
      const scripts = packageScripts(cwd);
      const name = ['coverage', 'test:coverage'].find((candidate) => scripts[candidate]);
      return name ? `npm run ${name}` : '';
    },
  },
  {
    id: 'maven',
    label: 'Maven',
    manifests: ['pom.xml'],
    checks: () => 'mvn -B verify',
    coverage: (cwd, manifest) => (/jacoco/i.test(manifest) ? 'mvn -B verify' : ''),
  },
  {
    id: 'gradle',
    label: 'Gradle',
    manifests: ['build.gradle', 'build.gradle.kts'],
    checks: (cwd) => (existsSync(join(cwd, 'gradlew')) ? './gradlew check' : 'gradle check'),
    coverage: (cwd, manifest) =>
      /jacoco/i.test(manifest) ? `${existsSync(join(cwd, 'gradlew')) ? './gradlew' : 'gradle'} jacocoTestReport` : '',
  },
  {
    id: 'sbt',
    label: 'sbt',
    manifests: ['build.sbt'],
    checks: () => 'sbt test',
    coverage: (cwd, manifest) =>
      /scoverage|sbt-coverage/i.test(manifest) ? 'sbt clean coverage test coverageReport' : '',
  },
  {
    id: 'python',
    label: 'Python',
    manifests: ['pyproject.toml', 'setup.cfg', 'tox.ini', 'requirements.txt'],
    checks: (cwd, manifest) => (/pytest/i.test(manifest) ? 'pytest' : ''),
    coverage: (cwd, manifest) => (/pytest-cov|coverage/i.test(manifest) ? 'pytest --cov' : ''),
  },
  {
    id: 'cargo',
    label: 'Cargo',
    manifests: ['Cargo.toml'],
    checks: () => 'cargo test',
    coverage: () => '',
  },
  {
    id: 'go',
    label: 'Go',
    manifests: ['go.mod'],
    checks: () => 'go test ./...',
    coverage: () => 'go test -cover ./...',
  },
];

/** The first stack whose build file is here, with that file's text. */
export function detectStack(cwd) {
  for (const stack of STACKS) {
    for (const name of stack.manifests) {
      const path = join(cwd, name);
      if (!existsSync(path)) continue;
      let text = '';
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        text = '';
      }
      return { ...stack, manifest: name, text };
    }
  }
  return null;
}

const CODE_EXTENSIONS = new Set([
  '.java', '.scala', '.sbt', '.kt', '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.go', '.rs', '.rb', '.php', '.cs', '.c', '.h', '.cpp', '.hpp', '.swift', '.sql', '.sh',
]);

const IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'target', 'build', 'dist', 'out', 'venv', '.venv', '__pycache__', '.claude',
]);

/**
 * Whether this project has code yet — a build file, or a source file somewhere.
 *
 * A project that has none is one being started, and the questions about tests,
 * coverage and checks have no answer yet. They are skipped rather than asked
 * blind, and `configure` picks them up the day there is something to run.
 */
export function hasCode(cwd, { depth = 3 } = {}) {
  if (detectStack(cwd)) return true;

  const walk = (dir, left) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return false;
    }
    const directories = [];
    for (const entry of entries) {
      const path = join(dir, entry);
      let stats;
      try {
        stats = statSync(path);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry) && left > 0) directories.push(path);
        continue;
      }
      const dot = entry.lastIndexOf('.');
      if (dot > 0 && CODE_EXTENSIONS.has(entry.slice(dot))) return true;
    }
    return directories.some((path) => walk(path, left - 1));
  };

  return walk(cwd, depth);
}

/**
 * A plausible "commands that must pass before a push", read off the project's
 * own build file. Suggested, never imposed — the wizard shows it as a default
 * the user edits, and shows where it got it from.
 */
export function suggestLocalChecks(cwd) {
  const stack = detectStack(cwd);
  return stack ? stack.checks(cwd, stack.text) || '' : '';
}

export function suggestCoverageCommand(cwd) {
  const stack = detectStack(cwd);
  return stack ? stack.coverage(cwd, stack.text) || '' : '';
}

/** Everything screen 0 shows about where we are running. */
export function inspectProject(cwd) {
  const stack = detectStack(cwd);
  return {
    root: cwd,
    isGit: isGitRepo(cwd),
    branch: currentBranch(cwd),
    baseBranch: baseBranch(cwd),
    stack: stack ? { id: stack.id, label: stack.label, manifest: stack.manifest } : null,
    hasCode: hasCode(cwd),
    hasClaudeDir: existsSync(join(cwd, '.claude')),
    hasClaudeMd: existsSync(join(cwd, CLAUDE_MD_PATH)) || existsSync(join(cwd, LEGACY_CLAUDE_MD_PATH)),
  };
}
