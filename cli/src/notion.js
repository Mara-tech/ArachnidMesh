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

import { modulesRoot } from './modules.js';

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
 * (`.../rediger-un-ticket-<id>`), and an unanchored match happily returns a
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

/** Notion caps one text object at 2000 characters: longer content is split. */
const TEXT_LIMIT = 2000;

export function richText(content) {
  const chunks = [];
  for (let i = 0; i < content.length; i += TEXT_LIMIT) chunks.push(content.slice(i, i + TEXT_LIMIT));
  return (chunks.length ? chunks : ['']).map((chunk) => ({ type: 'text', text: { content: chunk } }));
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
 * Create the backlog database, its relations and its first tickets.
 *
 * @returns the answers this action provides — the data source URI and the URL,
 *   which is why ticking this component removes those questions from the
 *   configuration screen.
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
  await call(token, 'PATCH', `/data_sources/${dataSourceId}`, {
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
  };
}
