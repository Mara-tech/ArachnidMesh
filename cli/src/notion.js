/**
 * Notion API — port of tools/create_notion_backlog.py and get_data_source_id.py.
 *
 * Both scripts stay in the repository for whoever prefers the manual route.
 * This is the same work, on one API version, with the corrections the port
 * made obvious:
 *
 *   - one `Notion-Version`, `2025-09-03`, instead of the two the scripts
 *     disagreed on (`2022-06-28` to create, `2025-09-03` to read). That version
 *     is the one that knows about data sources — properties now live under
 *     `initial_data_source`, relations point at a `data_source_id`, and the
 *     creation response already carries the `collection://` URI. Which means
 *     creating a backlog no longer needs a second lookup at all.
 *   - `cancelled` was missing from the status options, though the ticket rules
 *     describe it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { richText, splitDocument, toNotionBlocks } from './markdown.js';
import { modulesRoot } from './modules.js';

export { richText } from './markdown.js';

const NOTION_VERSION = '2025-09-03';
const BASE_URL = 'https://api.notion.com/v1';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

async function call(token, method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(token),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message ?? text;
      if (parsed.code === 'object_not_found') {
        detail += '\n  The page must be shared with your integration: open it in Notion, ' +
          '“…” → Connections → add your integration.';
      }
    } catch {
      /* keep the raw body */
    }
    throw new Error(`Notion ${method} ${path} — ${response.status}: ${detail}`);
  }

  return text ? JSON.parse(text) : {};
}

/** Initials of the backlog name, ASCII only, at most five characters. */
export function makePrefix(name) {
  const ascii = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
  const words = ascii.match(/[A-Za-z0-9]+/g) ?? [];
  const prefix = words.map((word) => word[0].toUpperCase()).join('');
  return prefix.slice(0, 5) || 'ID';
}

/** Same sanitising for a prefix the user typed, so both paths agree. */
export function normalisePrefix(prefix, fallbackName) {
  if (!prefix) return makePrefix(fallbackName);
  const cleaned = (prefix.match(/[A-Za-z0-9]+/g) ?? []).join('').toUpperCase().slice(0, 5);
  return cleaned || makePrefix(fallbackName);
}

const UUID_IN_URL = /[-/]([0-9a-fA-F]{32})(?:\?|$)/;
const BARE_UUID = /^([0-9a-fA-F]{8})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{12})$/;

/**
 * A Notion id out of a URL or a raw id.
 *
 * Anchored at the end of the string: a title slug can contain hex runs
 * (`.../writing-a-ticket-<id>`), and an unanchored match happily returns a
 * fragment of the slug.
 */
export function extractId(raw) {
  const value = String(raw).trim();

  const bare = BARE_UUID.exec(value);
  if (bare) return bare.slice(1).join('-');

  const match = UUID_IN_URL.exec(value);
  if (!match) throw new Error(`No Notion id found in: ${raw}`);

  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The `collection://…` URI the skill and the rules need. */
export async function resolveDataSource(token, urlOrId) {
  const id = extractId(urlOrId);
  const database = await call(token, 'GET', `/databases/${id}`);
  const dataSources = database.data_sources ?? [];

  if (!dataSources.length) throw new Error('That database exposes no data source.');
  if (dataSources.length > 1) {
    const names = dataSources.map((ds) => `${ds.name} → collection://${ds.id}`).join('\n  ');
    throw new Error(`That database has several data sources — pick one:\n  ${names}`);
  }

  return {
    dataSourceUri: `collection://${dataSources[0].id}`,
    dataSourceId: dataSources[0].id,
    databaseId: database.id,
    url: database.url,
    title: (database.title ?? []).map((t) => t.plain_text).join('') || '(untitled)',
  };
}

const PROPERTIES = {
  Titre: { title: {} },
  Description: { rich_text: {} },
  'Priorité': { number: { format: 'number' } },

  Statut: {
    select: {
      options: [
        { name: 'todo', color: 'gray' },
        { name: 'in progress', color: 'blue' },
        { name: 'review in progress', color: 'yellow' },
        { name: 'done', color: 'green' },
        { name: 'cancelled', color: 'red' },
      ],
    },
  },

  Genre: {
    select: {
      options: [
        { name: 'feature', color: 'green' },
        { name: 'bug', color: 'red' },
        { name: 'déploiement', color: 'purple' },
        { name: 'cadrage', color: 'blue' },
      ],
    },
  },

  'Créé le': { created_time: {} },
  'Modifié le': { last_edited_time: {} },

  Tags: {
    multi_select: {
      options: [
        { name: 'refactoring', color: 'orange' },
        { name: 'UI', color: 'purple' },
        { name: 'API', color: 'blue' },
        { name: 'base de données', color: 'brown' },
        { name: 'performance', color: 'red' },
        { name: 'sécurité', color: 'pink' },
        { name: 'documentation', color: 'gray' },
      ],
    },
  },

  Version: { rich_text: {} },
  Commentaires: { rich_text: {} },
};

/**
 * The first tickets of a new backlog, read from the module rather than written
 * here: `tools/sample-tickets.json` is shared with create_notion_backlog.py, so
 * the manual route and the wizard create the same backlog.
 *
 * They are not a connection test. They frame the project — needs, preferences,
 * architecture, specifications — which is the work the queue has to start with.
 */
export function sampleTicketsPath(root = modulesRoot()) {
  return join(root, 'notion-backlog', 'tools', 'sample-tickets.json');
}

export function loadSampleTickets(path = sampleTicketsPath()) {
  return JSON.parse(readFileSync(path, 'utf8')).tickets;
}

/** Body lines to blocks: `## ` heading, `- [ ] ` checkbox, `- ` bullet, else a paragraph. */
export function toBlocks(lines = []) {
  const block = (type, content, extra = {}) => ({
    object: 'block',
    type,
    [type]: { rich_text: richText(content), ...extra },
  });

  return lines
    .filter((line) => line.trim() !== '')
    .map((line) => {
      if (line.startsWith('## ')) return block('heading_2', line.slice(3));
      if (line.startsWith('- [ ] ')) return block('to_do', line.slice(6), { checked: false });
      if (line.startsWith('- ')) return block('bulleted_list_item', line.slice(2));
      return block('paragraph', line);
    });
}

const NOT_PROPERTIES = new Set(['key', 'dependsOn', 'body']);

export function toProperties(ticket, pageIds = {}) {
  const props = {};
  for (const [key, value] of Object.entries(ticket)) {
    if (NOT_PROPERTIES.has(key)) continue;
    if (key === 'Titre') props[key] = { title: richText(value) };
    else if (key === 'Priorité') props[key] = { number: value };
    else if (key === 'Statut' || key === 'Genre') props[key] = { select: { name: value } };
    else if (key === 'Tags') props[key] = { multi_select: value.map((name) => ({ name })) };
    else props[key] = { rich_text: richText(value) };
  }
  if (ticket.dependsOn?.length) {
    props['Dépend de'] = { relation: ticket.dependsOn.map((dependency) => ({ id: pageIds[dependency] })) };
  }
  return props;
}

/**
 * The views a new backlog opens with, next to the default table Notion creates.
 *
 * Declared by property *name*: ids only exist once the data source does, and
 * `viewRequest` swaps them in. A select sorts by the order of its options, so
 * « Statut descending » reads review in progress → in progress → todo.
 */
const statusIn = (...names) => ({ or: names.map((name) => ({ property: 'Statut', select: { equals: name } })) });

export const VIEWS = [
  {
    name: 'Next tasks',
    filter: statusIn('todo', 'in progress', 'review in progress'),
    sorts: [
      { property: 'Statut', direction: 'descending' },
      { property: 'Priorité', direction: 'descending' },
    ],
    columns: ['ID', 'Titre', 'Statut', 'Priorité', 'Créé le', 'Genre', 'Tags'],
  },
  {
    name: 'Last done',
    filter: statusIn('done', 'in progress', 'review in progress'),
    sorts: [
      { property: 'Modifié le', direction: 'descending' },
      { property: 'Statut', direction: 'ascending' },
    ],
    columns: ['ID', 'Titre', 'Statut', 'Modifié le', 'Genre', 'Tags'],
  },
  {
    name: 'Group by status',
    groupBy: 'Statut',
    sorts: [{ property: 'Modifié le', direction: 'descending' }],
  },
];

/**
 * The body of `POST /views` for one view, given the data source's properties as
 * Notion returned them (`{ name: { id, type } }`).
 *
 * A view that lists columns shows those, in that order, and hides every other
 * one; a view that does not keeps Notion's default layout.
 */
export function viewRequest(view, { databaseId, dataSourceId, properties }) {
  const idOf = (name) => {
    const property = properties[name];
    if (!property) throw new Error(`View “${view.name}” names a property the backlog does not have: ${name}`);
    return property.id;
  };

  const configuration = { type: 'table' };
  if (view.columns) {
    const shown = view.columns.map((name) => ({ property_id: idOf(name), visible: true }));
    const hidden = Object.keys(properties)
      .filter((name) => !view.columns.includes(name))
      .map((name) => ({ property_id: idOf(name), visible: false }));
    configuration.properties = [...shown, ...hidden];
  }
  if (view.groupBy) {
    configuration.group_by = {
      type: properties[view.groupBy]?.type ?? 'select',
      property_id: idOf(view.groupBy),
      sort: { direction: 'ascending' },
      hide_empty_groups: false,
    };
  }

  return {
    database_id: databaseId,
    data_source_id: dataSourceId,
    name: view.name,
    type: 'table',
    ...(view.filter && { filter: view.filter }),
    sorts: view.sorts,
    configuration,
  };
}

/**
 * Create the views on a backlog. A view Notion refuses is reported, not
 * thrown: the backlog already exists by then, and losing its URI over a view
 * the user can add by hand would be the worse outcome.
 *
 * @returns the names of the views that could not be created.
 */
export async function createViews({ token, databaseId, dataSourceId, properties, views = VIEWS, onProgress = () => {} }) {
  const failed = [];
  for (const view of views) {
    onProgress(`Creating the view “${view.name}”…`);
    try {
      await call(token, 'POST', '/views', viewRequest(view, { databaseId, dataSourceId, properties }));
    } catch (error) {
      failed.push({ name: view.name, reason: error.message });
    }
  }
  return failed;
}

/**
 * Create the backlog database, its relations, its views and its first tickets.
 *
 * @returns the answers this action provides — the data source URI and the URL,
 *   which is why ticking this component removes those questions from the
 *   configuration screen. `viewsFailed` is not an answer, only something to report.
 */
export async function createBacklog({ token, name, parentPageId, prefix, onProgress = () => {} }) {
  const idPrefix = normalisePrefix(prefix, name);

  onProgress(`Creating the database “${name}” (ticket ids ${idPrefix}-n)…`);
  const database = await call(token, 'POST', '/databases', {
    parent: { type: 'page_id', page_id: extractId(parentPageId) },
    title: [{ type: 'text', text: { content: name } }],
    initial_data_source: {
      properties: { ...PROPERTIES, ID: { unique_id: { prefix: idPrefix } } },
    },
  });

  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error('Notion created the database but returned no data source.');

  onProgress('Adding the self-referencing relations…');
  const dataSource = await call(token, 'PATCH', `/data_sources/${dataSourceId}`, {
    properties: {
      'Dépend de': {
        relation: {
          data_source_id: dataSourceId,
          type: 'dual_property',
          dual_property: { synced_property_name: 'Est une dépendance de' },
        },
      },
      'En rapport avec': {
        relation: { data_source_id: dataSourceId, type: 'single_property', single_property: {} },
      },
    },
  });

  const viewsFailed = await createViews({
    token,
    databaseId: database.id,
    dataSourceId,
    properties: dataSource.properties ?? {},
    onProgress,
  });

  onProgress('Creating the framing tickets…');
  const pageIds = {};
  for (const ticket of loadSampleTickets()) {
    const page = await call(token, 'POST', '/pages', {
      parent: { type: 'database_id', database_id: database.id },
      properties: toProperties(ticket, pageIds),
      children: toBlocks(ticket.body),
    });
    pageIds[ticket.key] = page.id;
  }

  return {
    dataSourceUri: `collection://${dataSourceId}`,
    backlogUrl: database.url,
    backlogName: name,
    ticketPrefix: idPrefix,
    viewsFailed,
  };
}

/* -------------------------------------------------------------------------- */
/*  « Writing a ticket » — the page the rules and the skills point at          */
/* -------------------------------------------------------------------------- */

/**
 * The page ships with the module and is pushed to Notion from here, so the two
 * can drift: the user edits nothing, but a newer CLI carries a newer page.
 *
 * A standalone Notion page has no properties beyond its title — there is no
 * metadata field to hide a version in. So the version travels **in the page**,
 * as the marker in its footer, which is the only thing that survives a round
 * trip through Notion's block model and stays readable to whoever opens it.
 */
const VERSION_MARKER = /arachnid-mesh:writing-a-ticket:v(\d+)/;

/** The version a page declares, or null when it carries no marker at all. */
export function pageVersion(text) {
  const match = VERSION_MARKER.exec(String(text ?? ''));
  return match ? Number(match[1]) : null;
}

export function ticketPagePath(root = modulesRoot()) {
  return join(root, 'notion-backlog', 'tools', 'writing-a-ticket.md');
}

/** The shipped page: its title, its version, and the blocks Notion will hold. */
export function loadTicketPage(path = ticketPagePath()) {
  const markdown = readFileSync(path, 'utf8');
  const { title, body } = splitDocument(markdown);
  const version = pageVersion(markdown);

  if (!title) throw new Error(`${path} has no "# " title line — the Notion page would be untitled.`);
  if (version === null) {
    throw new Error(`${path} carries no version marker — expected arachnid-mesh:writing-a-ticket:vN in its footer.`);
  }

  return { title, version, markdown, blocks: toNotionBlocks(body) };
}

/**
 * What to do with a page that already exists — decided before a single call
 * that writes, and away from the prompting, so it can be read and tested.
 *
 * `installed` is the version read off the page in Notion, `null` when it
 * carries no marker. That last case is the one that matters: an unmarked page
 * is somebody's own — the manual setup created it by hand — and rewriting it
 * throws their content away. So it is the one case that defaults to *no*.
 */
export function planTicketPage({ shipped, installed }) {
  if (installed === null) {
    return {
      action: 'replace',
      defaultAnswer: false,
      message:
        `That page carries no ArachnidMesh version marker, so it was not written by this wizard. ` +
        `Updating replaces its whole content with version ${shipped}.`,
    };
  }
  if (installed === shipped) {
    return { action: 'skip', defaultAnswer: false, message: `Already at version ${installed}.` };
  }
  if (installed > shipped) {
    return {
      action: 'skip',
      defaultAnswer: false,
      message: `The page is at version ${installed}, newer than the ${shipped} this CLI ships — left alone.`,
    };
  }
  return {
    action: 'replace',
    defaultAnswer: true,
    message: `A newer page ships with this CLI: version ${installed} → ${shipped}.`,
  };
}

/** Notion takes at most 100 children per call, whether creating or appending. */
const CHILDREN_LIMIT = 100;

export function batches(items, size = CHILDREN_LIMIT) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function listChildren(token, blockId) {
  const out = [];
  let cursor = null;

  do {
    const query = cursor ? `?page_size=100&start_cursor=${cursor}` : '?page_size=100';
    const page = await call(token, 'GET', `/blocks/${blockId}/children${query}`);
    out.push(...(page.results ?? []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return out;
}

/** Every piece of text a page holds, flattened — enough to find the marker. */
export function plainText(blocks) {
  const out = [];
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (typeof value.plain_text === 'string') out.push(value.plain_text);
    for (const nested of Object.values(value)) walk(nested);
  };
  walk(blocks);
  return out.join('\n');
}

/**
 * Replace a page's content: append first, delete after.
 *
 * Notion has no « set the children of this block » call, so this is two halves
 * that can fail between them. Appending first means a failure leaves the old
 * page plus the new one — ugly, but nothing is lost and running it again
 * finishes the job. Deleting first would leave an empty page.
 */
async function replaceChildren(token, pageId, existing, blocks) {
  for (const batch of batches(blocks)) {
    await call(token, 'PATCH', `/blocks/${pageId}/children`, { children: batch });
  }
  for (const block of existing) {
    await call(token, 'DELETE', `/blocks/${block.id}`);
  }
}

/**
 * Create the « Writing a ticket » page, or bring an existing one up to the
 * version shipped here.
 *
 * @param confirm asked before anything is overwritten, with the decision
 *   `planTicketPage` took; it carries the answer that should be the default.
 * @returns the answer this action provides — the page URL the rules link to —
 *   plus what happened, for the caller to report.
 */
export async function writeTicketPage({
  token,
  parentPageId,
  pageUrl,
  page = loadTicketPage(),
  onProgress = () => {},
  confirm = async (decision) => decision.defaultAnswer,
}) {
  if (pageUrl) {
    const pageId = extractId(pageUrl);

    onProgress('Reading the page in Notion…');
    const existing = await listChildren(token, pageId);
    const installed = pageVersion(plainText(existing));
    const decision = planTicketPage({ shipped: page.version, installed });

    if (decision.action === 'skip') {
      return { ticketPageUrl: pageUrl, outcome: 'skipped', version: installed, decision };
    }
    if (!(await confirm(decision))) {
      return { ticketPageUrl: pageUrl, outcome: 'declined', version: installed, decision };
    }

    onProgress(`Rewriting the page at version ${page.version}…`);
    await replaceChildren(token, pageId, existing, page.blocks);
    await call(token, 'PATCH', `/pages/${pageId}`, {
      properties: { title: { title: richText(page.title) } },
    });

    return { ticketPageUrl: pageUrl, outcome: 'updated', version: page.version, decision };
  }

  if (!parentPageId) throw new Error('No page to update and no parent page to create one under.');

  onProgress(`Creating the page “${page.title}”…`);
  const [first, ...rest] = batches(page.blocks);
  const created = await call(token, 'POST', '/pages', {
    parent: { type: 'page_id', page_id: extractId(parentPageId) },
    properties: { title: { title: richText(page.title) } },
    children: first ?? [],
  });

  for (const batch of rest) {
    await call(token, 'PATCH', `/blocks/${created.id}/children`, { children: batch });
  }

  return { ticketPageUrl: created.url, outcome: 'created', version: page.version };
}
