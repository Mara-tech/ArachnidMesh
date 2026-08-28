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
 *   - the first sample ticket was created `in progress`, contradicting
 *     « À la création, toujours `todo`, sans exception » — the first example a
 *     new user sees taught the opposite of the rule.
 *   - `cancelled` was missing from the status options, though the ticket rules
 *     describe it.
 */

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
 * Sample tickets — every one `todo`, as « Rédiger un ticket » requires, and
 * written the way that page asks: constat, conséquence, Definition of Done.
 * They are the first thing a new user reads, so they teach the rule instead of
 * contradicting it. Priorities are spaced by 500 to leave room to insert.
 */
const SAMPLE_TICKETS = [
  {
    Titre: 'Le projet démarre sans configuration reproductible',
    Description:
      "Constat : le dépôt n'a ni dépendances figées ni linter configuré, vérifié à la création de la backlog.\n" +
      "Conséquence : deux machines ne produisent pas le même résultat, et rien ne cadre les contributions.\n\n" +
      '## ✅ Definition of Done\n' +
      '- [ ] Les dépendances sont installables en une commande, à versions figées\n' +
      '- [ ] Un linter tourne en local et échoue sur une violation introduite exprès\n' +
      "- [ ] La structure de dossiers est décrite dans le README\n" +
      '- [ ] Hors périmètre : aucune mise en place de CI dans ce ticket',
    'Priorité': 5000,
    Statut: 'todo',
    Genre: 'feature',
    Version: '1.0',
  },
  {
    Titre: 'Aucune vérification automatique ne tourne sur les pull requests',
    Description:
      "Constat : aucune pull request ne déclenche de contrôle, vérifié à la création de la backlog.\n" +
      "Conséquence : le skill /go ne peut pas s'appuyer sur un verdict, et une régression passe sans être vue.\n\n" +
      '## ✅ Definition of Done\n' +
      '- [ ] Les tests tournent à chaque push sur une pull request\n' +
      '- [ ] Un test cassé exprès fait échouer la vérification\n' +
      '- [ ] Le rapport de couverture est publié\n' +
      '- [ ] Hors périmètre : aucun déploiement automatique',
    'Priorité': 4500,
    Statut: 'todo',
    Genre: 'déploiement',
    Version: '1.0',
  },
  {
    Titre: "Un visiteur n'a aucune page d'accueil à ouvrir",
    Description:
      "Constat : le projet ne sert aucune page, vérifié à la création de la backlog.\n" +
      "Conséquence : il n'y a rien à montrer, ni à tester de bout en bout.\n\n" +
      '## ✅ Definition of Done\n' +
      "- [ ] Une page d'accueil se charge et affiche le nom du projet\n" +
      '- [ ] Elle est lisible sur mobile comme sur desktop\n' +
      "- [ ] Un test de bout en bout ouvre la page et vérifie son contenu\n" +
      '- [ ] Hors périmètre : aucun travail graphique au-delà du strict lisible',
    'Priorité': 4000,
    Statut: 'todo',
    Genre: 'feature',
    Tags: ['UI'],
  },
];

function toProperties(ticket) {
  const props = {};
  for (const [key, value] of Object.entries(ticket)) {
    if (key === 'Titre') props[key] = { title: [{ type: 'text', text: { content: value } }] };
    else if (key === 'Priorité') props[key] = { number: value };
    else if (key === 'Statut' || key === 'Genre') props[key] = { select: { name: value } };
    else if (key === 'Tags') props[key] = { multi_select: value.map((name) => ({ name })) };
    else props[key] = { rich_text: [{ type: 'text', text: { content: value } }] };
  }
  return props;
}

/**
 * Create the backlog database, its relations and its sample tickets.
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

  onProgress('Creating the sample tickets…');
  for (const ticket of SAMPLE_TICKETS) {
    await call(token, 'POST', '/pages', {
      parent: { type: 'database_id', database_id: database.id },
      properties: toProperties(ticket),
    });
  }

  return {
    dataSourceUri: `collection://${dataSourceId}`,
    backlogUrl: database.url,
    backlogName: name,
    ticketPrefix: idPrefix,
  };
}
