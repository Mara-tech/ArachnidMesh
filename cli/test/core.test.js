import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { render, findUnresolved, resolveConditionals, stripSetupOnly } from '../src/render.js';
import { detectStack, hasCode, suggestCoverageCommand, suggestLocalChecks } from '../src/project.js';
import { buildPlan } from '../src/plan.js';
import { planSettingsMerge } from '../src/settings.js';
import { resolveRequires } from '../src/select.js';
import { planQuestions } from '../src/questions.js';
import {
  batches,
  extractId,
  loadSampleTickets,
  loadTicketPage,
  makePrefix,
  normalisePrefix,
  pageVersion,
  planTicketPage,
  plainText,
  richText,
  toBlocks,
  toProperties,
  VIEWS,
  viewRequest,
  writeTicketPage,
} from '../src/notion.js';
import { calloutIcon, codeLanguage, inlineRichText, splitDocument, toNotionBlocks } from '../src/markdown.js';
import { discoverModules } from '../src/modules.js';
import { claudeMdChange, legacyClaudeMdChange } from '../src/plan.js';

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
  const { content } = render(source, PLACEHOLDERS, { projectName: 'Dharma', projectPitch: 'a station network' });

  assert.equal(content, 'Dharma — a station network');
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
  // .claude/CLAUDE.md rather than under .claude/skills/.
  const found = findUnresolved('database **<Backlog Name>**', { '<Backlog Name>': 'backlogName' });
  assert.deepEqual(found, [{ token: '<Backlog Name>', key: 'backlogName' }]);
});

test('a conditional keeps the wording that matches the answer', () => {
  const source = [
    '| What | Command |',
    '<!-- arachnid:if localChecks -->',
    '| before a push | `<your-local-checks>` |',
    '<!-- arachnid:else -->',
    '| before a push | *not recorded yet* |',
    '<!-- arachnid:end -->',
  ].join('\n');

  const set = render(source, { '<your-local-checks>': 'localChecks' }, { localChecks: 'sbt test' });
  assert.ok(set.content.includes('`sbt test`'));
  assert.ok(!set.content.includes('not recorded yet'));
  assert.deepEqual(set.deferred, []);

  const unset = render(source, { '<your-local-checks>': 'localChecks' }, {});
  assert.ok(unset.content.includes('*not recorded yet*'));
  // The point of the whole mechanism: nothing is left for the skill to trip on.
  assert.deepEqual(unset.unresolved, [], 'the dropped branch took its placeholder with it');
  assert.deepEqual(unset.deferred, ['localChecks']);
});

test('a conditional without an else branch simply disappears', () => {
  const { content, deferred } = resolveConditionals(
    'before\n<!-- arachnid:if coverageCmd -->\nreport coverage\n<!-- arachnid:end -->\nafter',
    {},
  );
  assert.equal(content, 'before\nafter');
  assert.deepEqual(deferred, ['coverageCmd']);
});

test('a test command is read off the project, whatever it is built with', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arachnid-'));
  writeFileSync(join(dir, 'pom.xml'), '<project><artifactId>jacoco-maven-plugin</artifactId></project>');

  assert.equal(detectStack(dir).id, 'maven');
  assert.equal(suggestLocalChecks(dir), 'mvn -B verify');
  assert.equal(suggestCoverageCommand(dir), 'mvn -B verify', 'jacoco is declared, so coverage exists');

  const bare = mkdtempSync(join(tmpdir(), 'arachnid-'));
  writeFileSync(join(bare, 'build.sbt'), 'name := "dharma"');
  assert.equal(suggestLocalChecks(bare), 'sbt test');
  assert.equal(suggestCoverageCommand(bare), '', 'no coverage plugin declared, so nothing is invented');
});

test('an empty directory is a project about to start, not a project without tests', () => {
  const empty = mkdtempSync(join(tmpdir(), 'arachnid-'));
  assert.equal(hasCode(empty), false);
  assert.equal(suggestLocalChecks(empty), '');

  const started = mkdtempSync(join(tmpdir(), 'arachnid-'));
  mkdirSync(join(started, 'src'));
  writeFileSync(join(started, 'src', 'Main.scala'), 'object Main');
  assert.equal(hasCode(started), true);
});

test('a question the project answers is never put to the user', () => {
  const module = {
    id: 'notion-backlog',
    questions: {
      mainBranch: { type: 'text' },
      localChecks: { type: 'text', derived: true, default: 'stack.localChecks' },
    },
    components: [{ id: 'go', needs: ['mainBranch', 'localChecks'] }],
  };
  const selection = [{ module, component: module.components[0] }];

  const { questions, derived, all } = planQuestions(selection, { projectRoot: mkdtempSync(join(tmpdir(), 'arachnid-')) });

  assert.deepEqual(questions.map((q) => q.key), ['mainBranch']);
  assert.deepEqual(derived.map((q) => q.key), ['localChecks']);
  assert.equal(all.length, 2, 'it is still answered, just not asked');
});

test('a seed file is written once and never touched again', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arachnid-'));
  const module = discoverModules().find((candidate) => candidate.id === 'notion-backlog');
  const component = module.components.find((candidate) => candidate.id === 'checks');
  const selection = [{ module, component }];
  const answers = { localChecks: 'pytest' };

  const first = buildPlan({ projectRoot: dir, selection, answers, manifest: {} });
  const seeded = first.changes.find((change) => change.path === '.claude/rules/checks.md');
  assert.equal(seeded.action, 'create');
  assert.ok(seeded.content.includes('`pytest`'));

  mkdirSync(join(dir, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(dir, '.claude/rules/checks.md'), '# Local checks\n\nwhat the project wrote itself\n');

  const second = buildPlan({ projectRoot: dir, selection, answers, manifest: {} });
  const kept = second.changes.find((change) => change.path === '.claude/rules/checks.md');
  assert.equal(kept.action, 'kept');
  assert.equal(kept.content, '# Local checks\n\nwhat the project wrote itself\n');
  assert.equal(second.nothingToDo, false, 'the CLAUDE.md block is still to write');
  assert.equal(second.changes.filter((c) => c.path === '.claude/rules/checks.md' && c.action === 'update').length, 0);
});

test('the go skill no longer hard-codes what a project runs', () => {
  const module = discoverModules().find((candidate) => candidate.id === 'notion-backlog');
  const skill = readFileSync(join(module.dir, 'skills/go/SKILL.md'), 'utf8');
  const { content, unresolved } = render(skill, module.placeholders, {
    dataSourceUri: 'collection://a1b2c3d4-e5f6-4789-abcd-0123456789ef',
    mainBranch: 'main',
  });

  // Someone starting a project answers neither of these, and the skill still
  // installs whole — the placeholder left behind is what used to break /go.
  assert.deepEqual(unresolved, []);
  assert.ok(content.includes('.claude/rules/checks.md'), 'it points at the file the project keeps');
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
  const url = 'https://app.notion.com/p/writing-a-ticket-3bc095c7d7e48197acb6e133331aa977';
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
  assert.equal(makePrefix('Dharma Project'), 'DP');
  assert.equal(makePrefix('Dharma Éveil'), 'DE');
});

test('a typed prefix is sanitised the same way a derived one is', () => {
  assert.equal(normalisePrefix('PRJ-x', 'ignored'), 'PRJX');
  assert.equal(normalisePrefix('', 'Dharma Project'), 'DP');
  assert.equal(normalisePrefix('!!!', 'Dharma Project'), 'DP');
});

test('the first tickets obey « Writing a ticket »: todo, and never above a dependency', () => {
  const tickets = loadSampleTickets();
  const byKey = new Map(tickets.map((ticket) => [ticket.key, ticket]));
  const seen = new Set();

  for (const ticket of tickets) {
    assert.equal(ticket.Statut, 'todo', ticket.key);
    assert.match(ticket.Description, /Definition of Done/, ticket.key);
    for (const dependency of ticket.dependsOn) {
      // Created in order: a relation can only point at a page that already exists.
      assert.ok(seen.has(dependency), `${ticket.key} depends on ${dependency}, created later or missing`);
      assert.ok(ticket['Priorité'] < byKey.get(dependency)['Priorité'], `${ticket.key} outranks ${dependency}`);
    }
    seen.add(ticket.key);
  }

  const priorities = tickets.map((ticket) => ticket['Priorité']);
  assert.equal(new Set(priorities).size, priorities.length, 'duplicate priority');
});

test('every Genre and Tag of the first tickets exists in the schema', async () => {
  const source = (await import('node:fs')).readFileSync(new URL('../src/notion.js', import.meta.url), 'utf8');
  for (const ticket of loadSampleTickets()) {
    assert.match(source, new RegExp(`name: '${ticket.Genre}'`), ticket.Genre);
    for (const tag of ticket.Tags ?? []) assert.match(source, new RegExp(`name: '${tag}'`), tag);
  }
});

test('a ticket becomes properties and blocks Notion accepts', () => {
  const [needs, preferences] = loadSampleTickets();
  const props = toProperties(preferences, { needs: 'page-1' });

  assert.deepEqual(props['Dépend de'], { relation: [{ id: 'page-1' }] });
  assert.equal(props.key, undefined);
  assert.equal(props.body, undefined);

  const types = toBlocks(needs.body).map((block) => block.type);
  assert.ok(types.includes('heading_2') && types.includes('bulleted_list_item') && types.includes('paragraph'));
  assert.deepEqual(toBlocks(['- [ ] done?'])[0].to_do.checked, false);
});

test('every property a view names exists in the schema', async () => {
  const source = (await import('node:fs')).readFileSync(new URL('../src/notion.js', import.meta.url), 'utf8');
  const names = VIEWS.flatMap((view) => [
    ...(view.columns ?? []),
    ...view.sorts.map((sort) => sort.property),
    ...(view.groupBy ? [view.groupBy] : []),
  ]);
  for (const name of new Set(names)) {
    if (name === 'ID') continue; // added at creation, with the prefix
    assert.match(source, new RegExp(`^  '?${name}'?: \{`, 'm'), name);
  }
});

test('a view becomes a request with property ids, its columns first and the rest hidden', () => {
  const properties = {
    Titre: { id: 'title', type: 'title' },
    ID: { id: 'id1', type: 'unique_id' },
    Statut: { id: 'st', type: 'select' },
    'Priorité': { id: 'pr', type: 'number' },
    'Créé le': { id: 'cr', type: 'created_time' },
    'Modifié le': { id: 'mo', type: 'last_edited_time' },
    Genre: { id: 'ge', type: 'select' },
    Tags: { id: 'ta', type: 'multi_select' },
    Description: { id: 'de', type: 'rich_text' },
  };
  const context = { databaseId: 'db', dataSourceId: 'ds', properties };
  const [next, , grouped] = VIEWS.map((view) => viewRequest(view, context));

  assert.equal(next.data_source_id, 'ds');
  assert.equal(next.database_id, 'db');
  assert.deepEqual(next.filter.or.map((clause) => clause.select.equals), ['todo', 'in progress', 'review in progress']);
  assert.deepEqual(
    next.configuration.properties.map((column) => [column.property_id, column.visible]),
    [['id1', true], ['title', true], ['st', true], ['pr', true], ['cr', true], ['ge', true], ['ta', true], ['mo', false], ['de', false]],
  );

  assert.equal(grouped.filter, undefined);
  assert.equal(grouped.configuration.properties, undefined);
  assert.deepEqual(grouped.configuration.group_by.property_id, 'st');
  assert.deepEqual(grouped.sorts, [{ property: 'Modifié le', direction: 'descending' }]);

  assert.throws(() => viewRequest(VIEWS[0], { ...context, properties: { Titre: properties.Titre } }), /does not have: ID/);
});

test('text over the 2000-character Notion limit is split, not truncated', () => {
  const chunks = richText('x'.repeat(4500));
  assert.deepEqual(chunks.map((chunk) => chunk.text.content.length), [2000, 2000, 500]);
});

test('the framing component is declared and its CLAUDE.md fragment exists', () => {
  const module = discoverModules().find((candidate) => candidate.id === 'notion-backlog');
  const framing = module.components.find((component) => component.id === 'framing');
  assert.ok(framing);
  assert.equal(framing.targets[0].to, '.claude/rules/framing.md');
  for (const path of [framing.claudeMd, framing.targets[0].from]) {
    assert.ok(existsSync(join(module.dir, path)), path);
  }
});

const ROOT_BLOCK = [
  '<!-- arachnid:notion-backlog -->',
  '## /go',
  '<!-- /arachnid:notion-backlog -->',
  '',
].join('\n');

function fakeModule(fragment) {
  const dir = mkdtempSync(join(tmpdir(), 'arachnid-module-'));
  mkdirSync(join(dir, 'claude-md'));
  writeFileSync(join(dir, 'claude-md/go.md'), fragment);
  return { id: 'notion-backlog', dir };
}

test('the CLAUDE.md block is written under .claude/, not at the project root', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'arachnid-'));
  const change = claudeMdChange({
    projectRoot,
    module: fakeModule('## /go\nOne iteration, one ticket.\n'),
    fragmentPaths: ['claude-md/go.md'],
    placeholders: {},
    answers: {},
  });

  assert.equal(change.path, '.claude/CLAUDE.md');
  assert.equal(change.action, 'create');
  assert.ok(change.content.includes('<!-- arachnid:notion-backlog -->'));
  assert.ok(!existsSync(join(projectRoot, 'CLAUDE.md')), 'the plan writes nothing on its own');
});

test('a block left in the root CLAUDE.md is taken out, and what surrounds it stays', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'arachnid-'));
  writeFileSync(join(projectRoot, 'CLAUDE.md'), `# Dharma\n\nWritten by hand.\n\n${ROOT_BLOCK}`);

  const change = legacyClaudeMdChange({ projectRoot, moduleId: 'notion-backlog' });

  assert.equal(change.action, 'update');
  assert.equal(change.path, 'CLAUDE.md');
  assert.equal(change.content, '# Dharma\n\nWritten by hand.\n');
});

test('a root CLAUDE.md holding nothing but our block is removed rather than left empty', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'arachnid-'));
  writeFileSync(join(projectRoot, 'CLAUDE.md'), ROOT_BLOCK);

  const change = legacyClaudeMdChange({ projectRoot, moduleId: 'notion-backlog' });

  assert.equal(change.action, 'delete');
  assert.equal(change.content, '');
});

test('a root CLAUDE.md we never wrote to is not touched', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'arachnid-'));
  writeFileSync(join(projectRoot, 'CLAUDE.md'), '# Dharma\n');

  assert.equal(legacyClaudeMdChange({ projectRoot, moduleId: 'notion-backlog' }), null);
  assert.equal(legacyClaudeMdChange({ projectRoot: mkdtempSync(join(tmpdir(), 'arachnid-')), moduleId: 'notion-backlog' }), null);
});

/* -------------------------------------------------------------------------- */
/*  Markdown → Notion blocks                                                   */
/* -------------------------------------------------------------------------- */

const typesOf = (blocks) => blocks.map((block) => block.type);
const textOf = (block) => (block[block.type].rich_text ?? []).map((piece) => piece.text.content).join('');

test('inline marks become annotations, and a link keeps its url', () => {
  const pieces = inlineRichText('a **bold** word, `code`, and [a link](https://example.com/x)');

  assert.deepEqual(pieces.map((piece) => piece.text.content), [
    'a ', 'bold', ' word, ', 'code', ', and ', 'a link',
  ]);
  assert.deepEqual(pieces[1].annotations, { bold: true });
  assert.deepEqual(pieces[3].annotations, { code: true });
  assert.deepEqual(pieces[5].text.link, { url: 'https://example.com/x' });
});

test('bold wins over italics, so ** is never read as two *', () => {
  const [piece] = inlineRichText('**both**');
  assert.deepEqual(piece.annotations, { bold: true });
  assert.equal(piece.text.content, 'both');
});

test('each markdown construct lands on the block Notion expects', () => {
  const blocks = toNotionBlocks([
    '## A heading',
    '',
    'A paragraph',
    'wrapped over two lines.',
    '',
    '- a bullet',
    '- [ ] a box',
    '- [x] a ticked box',
    '',
    '1. first',
    '',
    '---',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n'));

  assert.deepEqual(typesOf(blocks), [
    'heading_2', 'paragraph', 'bulleted_list_item', 'to_do', 'to_do',
    'numbered_list_item', 'divider', 'code',
  ]);
  assert.equal(textOf(blocks[1]), 'A paragraph wrapped over two lines.', 'the hard wrap is presentation');
  assert.equal(blocks[3].to_do.checked, false);
  assert.equal(blocks[4].to_do.checked, true);
  assert.equal(blocks[7].code.language, 'javascript');
  assert.equal(textOf(blocks[7]), 'const x = 1;');
});

test('a fenced block is copied verbatim, markdown inside and all', () => {
  const blocks = toNotionBlocks(['```markdown', '## not a heading', '- [ ] not a box', '```'].join('\n'));

  assert.deepEqual(typesOf(blocks), ['code']);
  assert.equal(textOf(blocks[0]), '## not a heading\n- [ ] not a box');
});

test('an unknown fence language falls back rather than having Notion reject it', () => {
  assert.equal(codeLanguage('scala'), 'scala');
  assert.equal(codeLanguage('py'), 'python');
  assert.equal(codeLanguage(''), 'plain text');
  assert.equal(codeLanguage('brainfuck'), 'plain text');
});

test('a quote that opens on an emoji becomes a callout, wearing it as its icon', () => {
  const [callout] = toNotionBlocks(['> ⚠️', '> Careful: this **bites**.'].join('\n'));

  assert.equal(callout.type, 'callout');
  assert.deepEqual(callout.callout.icon, { type: 'emoji', emoji: '⚠️' });
  assert.equal(textOf(callout), 'Careful: this bites.');
});

test('a quote without an icon stays a quote', () => {
  const [quote] = toNotionBlocks('> just a quote');
  assert.equal(quote.type, 'quote');
  assert.equal(calloutIcon('just a quote'), null);
});

test('a table drops its separator row and keeps it as a column header', () => {
  const [table] = toNotionBlocks([
    '| Property | What it carries |',
    '| --- | --- |',
    '| `Statut` | always todo |',
  ].join('\n'));

  assert.equal(table.type, 'table');
  assert.equal(table.table.table_width, 2);
  assert.equal(table.table.has_column_header, true);
  assert.equal(table.table.children.length, 2, 'the separator is not a row');
  assert.equal(table.table.children[1].table_row.cells[0][0].text.content, 'Statut');
});

test('a short row is padded, so every row holds table_width cells', () => {
  const [table] = toNotionBlocks(['| a | b | c |', '| --- | --- | --- |', '| only one |'].join('\n'));

  assert.equal(table.table.table_width, 3);
  assert.equal(table.table.children[1].table_row.cells.length, 3);
});

test('the title leaves the body, since a Notion page holds it as a property', () => {
  const { title, body } = splitDocument('# Writing a ticket\n\nThe body.\n');

  assert.equal(title, 'Writing a ticket');
  assert.equal(body.trim(), 'The body.');
  assert.deepEqual(typesOf(toNotionBlocks(body)), ['paragraph']);
});

/* -------------------------------------------------------------------------- */
/*  « Writing a ticket » — the page shipped with the module                     */
/* -------------------------------------------------------------------------- */

test('the shipped page carries a title and a version, and converts whole', () => {
  const page = loadTicketPage();

  assert.equal(page.title, 'Writing a ticket');
  assert.ok(Number.isInteger(page.version) && page.version >= 1, 'an integer version');
  assert.ok(page.blocks.length > 50, 'the whole page, not a fragment');

  // The page is what tells a reader — and the next run — which version it is.
  assert.equal(pageVersion(page.markdown), page.version);
  assert.ok(page.blocks.every((block) => typeof block[block.type] === 'object'), 'every block is well formed');
});

test('a page with no marker reads as unversioned rather than as version 0', () => {
  assert.equal(pageVersion('nothing here'), null);
  assert.equal(pageVersion('… `arachnid-mesh:writing-a-ticket:v12` — shipped'), 12);
});

test('plainText digs the marker out of the blocks Notion hands back', () => {
  const blocks = [
    { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'some prose' }] } },
    { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'arachnid-mesh:writing-a-ticket:v3' }, { plain_text: ' — shipped' }] } },
  ];

  assert.equal(pageVersion(plainText(blocks)), 3);
});

test('an update is proposed with yes as the default, and a no-op is never proposed', () => {
  assert.deepEqual(
    planTicketPage({ shipped: 3, installed: 2 }),
    { action: 'replace', defaultAnswer: true, message: 'A newer page ships with this CLI: version 2 → 3.' },
  );
  assert.equal(planTicketPage({ shipped: 3, installed: 3 }).action, 'skip');
  assert.equal(planTicketPage({ shipped: 3, installed: 4 }).action, 'skip', 'a newer page is left alone');
});

test('a page this wizard never wrote defaults to no — its content is somebody else\'s', () => {
  const decision = planTicketPage({ shipped: 3, installed: null });

  assert.equal(decision.action, 'replace');
  assert.equal(decision.defaultAnswer, false);
  assert.match(decision.message, /no ArachnidMesh version marker/);
});

test('batches never hand Notion more than the 100 children it accepts', () => {
  assert.deepEqual(batches(Array.from({ length: 213 }, (_, i) => i)).map((b) => b.length), [100, 100, 13]);
  assert.deepEqual(batches([]), []);
});

/* A Notion that records what it was asked, so the write paths can be walked. */
function stubNotion(reply = () => ({})) {
  const calls = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    const call = {
      method: init.method,
      path: String(url).replace('https://api.notion.com/v1', ''),
      body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return { ok: true, status: 200, text: async () => JSON.stringify(reply(call) ?? {}) };
  };

  return { calls, restore: () => { globalThis.fetch = original; } };
}

const PAGE_URL = 'https://app.notion.com/p/writing-a-ticket-3bc095c7d7e48197acb6e133331aa977';
const PAGE_ID = '3bc095c7-d7e4-8197-acb6-e133331aa977';

const fakePage = (version, blocks = 3) => ({
  title: 'Writing a ticket',
  version,
  markdown: `# Writing a ticket\n\narachnid-mesh:writing-a-ticket:v${version}`,
  blocks: Array.from({ length: blocks }, (_, i) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `block ${i}` } }] } })),
});

const childrenReply = (marker) => ({
  results: [
    { id: 'old-1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'old prose' }] } },
    { id: 'old-2', type: 'paragraph', paragraph: { rich_text: [{ plain_text: marker }] } },
  ],
  has_more: false,
});

test('creating the page sends the title as a property and the body in batches of 100', async () => {
  const notion = stubNotion(({ path }) =>
    path === '/pages' ? { id: 'page-id', url: 'https://notion.so/new-page' } : {});

  try {
    const result = await writeTicketPage({
      token: 't',
      parentPageId: 'https://app.notion.com/p/Backlogs-3bc095c7d7e48197acb6e133331aa977',
      page: fakePage(1, 142),
    });

    assert.equal(result.outcome, 'created');
    assert.equal(result.ticketPageUrl, 'https://notion.so/new-page');

    const [create, ...appends] = notion.calls;
    assert.equal(create.method, 'POST');
    assert.equal(create.body.parent.page_id, PAGE_ID);
    assert.deepEqual(create.body.properties.title.title[0].text.content, 'Writing a ticket');
    assert.equal(create.body.children.length, 100);
    assert.deepEqual(appends.map((c) => c.body.children.length), [42]);
    assert.ok(appends.every((c) => c.method === 'PATCH' && c.path === '/blocks/page-id/children'));
  } finally {
    notion.restore();
  }
});

test('updating appends before deleting, so a failure never empties the page', async () => {
  const notion = stubNotion(({ method, path }) =>
    method === 'GET' && path.startsWith(`/blocks/${PAGE_ID}/children`)
      ? childrenReply('arachnid-mesh:writing-a-ticket:v1')
      : {});

  try {
    const result = await writeTicketPage({
      token: 't',
      pageUrl: PAGE_URL,
      page: fakePage(2),
      confirm: async (decision) => decision.defaultAnswer,
    });

    assert.equal(result.outcome, 'updated');
    assert.equal(result.version, 2);

    const methods = notion.calls.map((call) => `${call.method} ${call.path}`);
    assert.deepEqual(methods, [
      `GET /blocks/${PAGE_ID}/children?page_size=100`,
      `PATCH /blocks/${PAGE_ID}/children`,
      'DELETE /blocks/old-1',
      'DELETE /blocks/old-2',
      `PATCH /pages/${PAGE_ID}`,
    ]);
  } finally {
    notion.restore();
  }
});

test('a page already at the shipped version is read and left untouched', async () => {
  const notion = stubNotion(() => childrenReply('arachnid-mesh:writing-a-ticket:v2'));

  try {
    const result = await writeTicketPage({ token: 't', pageUrl: PAGE_URL, page: fakePage(2) });

    assert.equal(result.outcome, 'skipped');
    assert.deepEqual(notion.calls.map((call) => call.method), ['GET'], 'nothing was written');
  } finally {
    notion.restore();
  }
});

test('saying no to the update writes nothing at all', async () => {
  const notion = stubNotion(() => childrenReply('arachnid-mesh:writing-a-ticket:v1'));

  try {
    const result = await writeTicketPage({
      token: 't',
      pageUrl: PAGE_URL,
      page: fakePage(2),
      confirm: async () => false,
    });

    assert.equal(result.outcome, 'declined');
    assert.deepEqual(notion.calls.map((call) => call.method), ['GET']);
  } finally {
    notion.restore();
  }
});

test('every action a module declares is registered in the CLI', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

  for (const module of discoverModules()) {
    for (const component of module.components) {
      if (!component.action) continue;
      assert.match(source, new RegExp(`'${component.action}':`), `${module.id}/${component.id}`);
    }
  }
});
