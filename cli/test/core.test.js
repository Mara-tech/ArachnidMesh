import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { render, findUnresolved, stripSetupOnly } from '../src/render.js';
import { planSettingsMerge } from '../src/settings.js';
import { resolveRequires } from '../src/select.js';
import { planQuestions } from '../src/questions.js';
import { extractId, makePrefix, normalisePrefix } from '../src/notion.js';

const PLACEHOLDERS = {
  '<your-notion-database>': 'dataSourceUri',
  '<your-main-branch>': 'mainBranch',
  '<Project name and very basic presentation>': 'projectPitch',
  '<Project name>': 'projectName',
};

test('render leaves runtime placeholders alone', () => {
  const source = 'push to <prefix>/<slug> on <your-main-branch>, PR <number>, see <url>';
  const { content } = render(source, PLACEHOLDERS, { mainBranch: 'main' });

  assert.equal(content, 'push to <prefix>/<slug> on main, PR <number>, see <url>');
});

test('render substitutes the longest token first', () => {
  const source = '<Project name> — <Project name and very basic presentation>';
  const { content } = render(source, PLACEHOLDERS, { projectName: 'LinkedIn', projectPitch: 'a network' });

  assert.equal(content, 'LinkedIn — a network');
});

test('render reports a missing answer instead of blanking the placeholder', () => {
  const source = 'FROM "<your-notion-database>"';
  const { content, unresolved } = render(source, PLACEHOLDERS, {});

  assert.equal(content, source, 'the placeholder stays verbatim');
  assert.deepEqual(unresolved, [{ token: '<your-notion-database>', key: 'dataSourceUri' }]);
});

test('render treats an empty answer as missing', () => {
  const { unresolved } = render('<your-main-branch>', PLACEHOLDERS, { mainBranch: '' });
  assert.equal(unresolved.length, 1);
});

test('setup-only sections are stripped, and their tokens never counted', () => {
  const source = [
    '# Skill',
    '',
    '<!-- arachnid:setup-only -->',
    '| `<your-notion-database>` | the URI | example |',
    '<!-- /arachnid:setup-only -->',
    '',
    'FROM "<your-notion-database>"',
  ].join('\n');

  const { content, unresolved } = render(source, PLACEHOLDERS, { dataSourceUri: 'collection://x' });

  assert.ok(!content.includes('the URI'), 'the documentation table is gone');
  assert.ok(content.includes('FROM "collection://x"'));
  assert.equal(unresolved.length, 0);
  assert.ok(!/\n{3,}/.test(content), 'no scar of blank lines is left behind');
});

test('stripSetupOnly is a no-op on a file without the fence', () => {
  assert.equal(stripSetupOnly('nothing to see'), 'nothing to see');
});

test('findUnresolved sees what the documented grep misses', () => {
  // `<Backlog Name>` does not follow the `<your-…>` convention, and lives in
  // CLAUDE.md rather than under .claude/skills/.
  const found = findUnresolved('database **<Backlog Name>**', { '<Backlog Name>': 'backlogName' });
  assert.deepEqual(found, [{ token: '<Backlog Name>', key: 'backlogName' }]);
});

test('settings merge keeps what the project already had', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arachnid-'));
  mkdirSync(join(dir, '.claude'));
  writeFileSync(
    join(dir, '.claude/settings.json'),
    JSON.stringify({
      permissions: { allow: ['Bash(npm test *)', 'mcp__claude_ai_Notion__notion-fetch'] },
      env: { SOMETHING: 'keep-me' },
    }),
  );

  const result = planSettingsMerge(dir, [
    { permissions: { allow: ['mcp__claude_ai_Notion__notion-fetch', 'Bash(git push:*)'] } },
  ]);

  assert.deepEqual(result.settings.permissions.allow, [
    'Bash(npm test *)',
    'mcp__claude_ai_Notion__notion-fetch',
    'Bash(git push:*)',
  ]);
  assert.equal(result.settings.env.SOMETHING, 'keep-me', 'unknown keys survive');
  assert.equal(result.added.length, 1, 'the already-granted permission is not counted twice');
});

test('settings merge on a project with no settings.json reports every addition', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arachnid-'));
  const result = planSettingsMerge(dir, [{ permissions: { allow: ['Bash(git push:*)'] } }]);

  assert.equal(result.unchanged, false);
  assert.deepEqual(result.settings.permissions.allow, ['Bash(git push:*)']);
});

const MODULES = [
  {
    id: 'notion-backlog',
    questions: {
      dataSourceUri: { type: 'text' },
      mainBranch: { type: 'text' },
      backlogUrl: { type: 'text' },
    },
    components: [
      { id: 'go', label: '/go', requires: ['rules'], needs: ['dataSourceUri', 'mainBranch'] },
      { id: 'go-auto', label: '/go-auto', requires: ['go'] },
      { id: 'rules', label: 'rules', needs: ['dataSourceUri', 'backlogUrl'] },
      { id: 'create', label: 'create', needs: ['mainBranch'], provides: ['dataSourceUri', 'backlogUrl'] },
    ],
  },
];

test('requires resolve transitively, and say what was pulled in', () => {
  const { keys, locked } = resolveRequires(MODULES, ['notion-backlog/go-auto']);

  assert.deepEqual(keys.sort(), [
    'notion-backlog/go',
    'notion-backlog/go-auto',
    'notion-backlog/rules',
  ]);
  assert.deepEqual(locked.sort(), ['notion-backlog/go', 'notion-backlog/rules']);
});

test('a question needed by two components is asked once', () => {
  const module = MODULES[0];
  const selection = [
    { module, component: module.components[0] }, // go
    { module, component: module.components[2] }, // rules
  ];

  const { questions } = planQuestions(selection, { projectRoot: process.cwd() });
  const keys = questions.map((q) => q.key);

  assert.deepEqual(keys, ['dataSourceUri', 'mainBranch', 'backlogUrl']);
  assert.equal(keys.filter((k) => k === 'dataSourceUri').length, 1);

  const shared = questions.find((q) => q.key === 'dataSourceUri');
  assert.deepEqual(shared.askedFor, ['/go', 'rules']);
});

test('a question an action provides is not asked', () => {
  const module = MODULES[0];
  const selection = [
    { module, component: module.components[2] }, // rules: needs dataSourceUri + backlogUrl
    { module, component: module.components[3] }, // create: provides both
  ];

  const { questions, provided } = planQuestions(selection, { projectRoot: process.cwd() });

  assert.deepEqual(questions.map((q) => q.key), ['mainBranch']);
  assert.deepEqual(provided.sort(), ['backlogUrl', 'dataSourceUri']);
});

test('previous answers win over derived defaults', () => {
  const module = MODULES[0];
  const selection = [{ module, component: module.components[0] }];

  const { questions } = planQuestions(selection, {
    projectRoot: process.cwd(),
    previousAnswers: { mainBranch: 'trunk' },
  });

  assert.equal(questions.find((q) => q.key === 'mainBranch').default, 'trunk');
});

test('extractId anchors on the end, so a slug full of hex does not win', () => {
  const url = 'https://app.notion.com/p/rediger-un-ticket-3bc095c7d7e48197acb6e133331aa977';
  assert.equal(extractId(url), '3bc095c7-d7e4-8197-acb6-e133331aa977');
});

test('extractId accepts a bare id, dashed or not', () => {
  assert.equal(extractId('3bc095c7d7e48197acb6e133331aa977'), '3bc095c7-d7e4-8197-acb6-e133331aa977');
  assert.equal(extractId('3bc095c7-d7e4-8197-acb6-e133331aa977'), '3bc095c7-d7e4-8197-acb6-e133331aa977');
});

test('extractId refuses what is not an id', () => {
  assert.throws(() => extractId('https://app.notion.com/p/no-id-here'), /No Notion id/);
});

test('a prefix is derived from initials, ASCII only', () => {
  assert.equal(makePrefix('Backlog Best Project Ever'), 'BBPE');
  assert.equal(makePrefix('Mon Projet'), 'MP');
  assert.equal(makePrefix('Éléphant Rosé'), 'ER');
});

test('a typed prefix is sanitised the same way a derived one is', () => {
  assert.equal(normalisePrefix('PRJ-x', 'ignored'), 'PRJX');
  assert.equal(normalisePrefix('', 'Mon Projet'), 'MP');
  assert.equal(normalisePrefix('!!!', 'Mon Projet'), 'MP');
});
