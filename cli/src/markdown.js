/**
 * Markdown → Notion blocks.
 *
 * The « Writing a ticket » page is written once, as markdown in the module, and
 * pushed to Notion by the wizard. So the subset supported here is exactly what
 * that page uses — headings, paragraphs, bullets, checkboxes, tables, quotes,
 * callouts, a code fence and a divider — plus the inline marks it needs.
 *
 * It is deliberately not a markdown implementation: anything it does not know
 * about lands as a paragraph, which is the failure a reader can see and fix,
 * rather than a call Notion rejects with a schema error.
 */

/** Notion caps one text object at 2000 characters: longer content is split. */
const TEXT_LIMIT = 2000;

function pieces(content, annotations, link) {
  const chunks = [];
  for (let i = 0; i < content.length; i += TEXT_LIMIT) chunks.push(content.slice(i, i + TEXT_LIMIT));
  return (chunks.length ? chunks : ['']).map((chunk) => {
    const piece = { type: 'text', text: { content: chunk } };
    if (link) piece.text.link = { url: link };
    if (annotations) piece.annotations = annotations;
    return piece;
  });
}

/** Plain text, unparsed — what a ticket property carries. */
export function richText(content) {
  return pieces(String(content));
}

// Longest-first: `**bold**` has to win over `*italic*`, and a link over both.
const INLINE = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function mark(token) {
  const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
  if (link) return pieces(link[1], undefined, link[2]);
  if (token.startsWith('**')) return pieces(token.slice(2, -2), { bold: true });
  if (token.startsWith('~~')) return pieces(token.slice(2, -2), { strikethrough: true });
  if (token.startsWith('`')) return pieces(token.slice(1, -1), { code: true });
  return pieces(token.slice(1, -1), { italic: true });
}

/** A line of markdown as Notion rich text, with its bold, code, italics and links. */
export function inlineRichText(text) {
  const out = [];
  let last = 0;

  for (const match of String(text).matchAll(INLINE)) {
    if (match.index > last) out.push(...pieces(text.slice(last, match.index)));
    out.push(...mark(match[0]));
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(...pieces(text.slice(last)));

  return out.length ? out : pieces('');
}

const block = (type, body) => ({ object: 'block', type, [type]: body });
const textBlock = (type, text, extra = {}) => block(type, { rich_text: inlineRichText(text), ...extra });

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(?!\[[ xX]\]\s)(.*)$/;
const TODO = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const DIVIDER = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```\s*(\S*)\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const CONTINUATION = /^\s+\S/;

/** Notion only knows three heading levels; deeper ones flatten onto the third. */
const headingType = (hashes) => `heading_${Math.min(hashes.length, 3)}`;

// Notion validates the language against its own list, so an unknown one is a
// rejected call rather than a plain block. Anything unmapped falls back.
const LANGUAGES = new Set([
  'bash', 'c', 'c++', 'c#', 'css', 'diff', 'docker', 'elixir', 'go', 'graphql', 'html', 'java',
  'javascript', 'json', 'kotlin', 'markdown', 'plain text', 'python', 'ruby', 'rust', 'scala',
  'shell', 'sql', 'swift', 'typescript', 'xml', 'yaml',
]);
const LANGUAGE_ALIASES = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'shell', yml: 'yaml', text: 'plain text' };

export function codeLanguage(fenceInfo) {
  const raw = (fenceInfo ?? '').trim().toLowerCase();
  const name = LANGUAGE_ALIASES[raw] ?? raw;
  return LANGUAGES.has(name) ? name : 'plain text';
}

const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
const isSeparatorRow = (row) => row.length > 0 && row.every((cell) => /^:?-+:?$/.test(cell));

/**
 * An icon-only quote line — `> 🎯` — turns the quote into a callout.
 *
 * Notion's own markdown export writes callouts that way, and the page relies on
 * them: a warning that reads as a warning is the point.
 */
export function calloutIcon(line) {
  const text = line.trim();
  if (!text || /[\w\s]/.test(text)) return null;
  return [...text].length <= 3 ? text : null;
}

/** Hard-wrapped source, one paragraph: the wrap is presentation, not content. */
const unwrap = (lines) => lines.map((line) => line.trim()).filter(Boolean).join(' ');

export function toNotionBlocks(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  const isBreak = (line) =>
    line.trim() === '' ||
    HEADING.test(line) ||
    DIVIDER.test(line) ||
    FENCE.test(line) ||
    QUOTE.test(line) ||
    TABLE_ROW.test(line) ||
    TODO.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line);

  /** The wrapped remainder of an item or a paragraph, from line `i`. */
  const continuation = (indented) => {
    const parts = [];
    while (i < lines.length && lines[i].trim() !== '') {
      const line = lines[i];
      if (indented && !CONTINUATION.test(line)) break;
      if (isBreak(line)) break;
      parts.push(line);
      i += 1;
    }
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      i += 1;
      const body = [];
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // the closing fence, or the end of the document
      blocks.push(block('code', {
        rich_text: richText(body.join('\n')),
        language: codeLanguage(fence[1]),
      }));
      continue;
    }

    if (DIVIDER.test(line)) {
      blocks.push(block('divider', {}));
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push(textBlock(headingType(heading[1]), heading[2].trim()));
      i += 1;
      continue;
    }

    if (TABLE_ROW.test(line)) {
      const rows = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      const hasHeader = rows.length > 1 && isSeparatorRow(rows[1]);
      const body = rows.filter((row) => !isSeparatorRow(row));
      const width = Math.max(...body.map((row) => row.length));
      blocks.push(block('table', {
        table_width: width,
        has_column_header: hasHeader,
        has_row_header: false,
        children: body.map((row) => block('table_row', {
          cells: Array.from({ length: width }, (_, column) => inlineRichText(row[column] ?? '')),
        })),
      }));
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i])[1]);
        i += 1;
      }
      const icon = calloutIcon(quoted[0] ?? '');
      const body = unwrap(icon ? quoted.slice(1) : quoted);
      blocks.push(icon
        ? textBlock('callout', body, { icon: { type: 'emoji', emoji: icon } })
        : textBlock('quote', body));
      continue;
    }

    const todo = TODO.exec(line);
    if (todo) {
      i += 1;
      blocks.push(textBlock('to_do', unwrap([todo[2], ...continuation(true)]), {
        checked: todo[1].toLowerCase() === 'x',
      }));
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      i += 1;
      blocks.push(textBlock('bulleted_list_item', unwrap([bullet[1], ...continuation(true)])));
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      i += 1;
      blocks.push(textBlock('numbered_list_item', unwrap([numbered[1], ...continuation(true)])));
      continue;
    }

    i += 1;
    blocks.push(textBlock('paragraph', unwrap([line, ...continuation(false)])));
  }

  return blocks;
}

/**
 * The `# ` title and the rest.
 *
 * A Notion page carries its title as a property, not as a block: left in the
 * body it would show up twice, once in the header and once as a heading.
 */
export function splitDocument(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const index = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (index === -1) return { title: null, body: lines.join('\n') };

  return {
    title: lines[index].replace(/^#\s+/, '').trim(),
    body: lines.slice(index + 1).join('\n'),
  };
}
