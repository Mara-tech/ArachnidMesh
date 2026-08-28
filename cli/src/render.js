/**
 * Placeholder substitution.
 *
 * The module files hold two kinds of `<…>` that look alike:
 *
 *   setup     `<your-notion-database>`, `<Backlog Name>`, `<TICKET_ID_PREFIX>` …
 *             filled once, here, from the wizard's answers
 *   runtime   `<prefix>`, `<slug>`, `<number>`, `<url>`, `<base-branch>` …
 *             filled by the agent on every iteration, and never by us
 *
 * So substitution is driven by the module's declared `placeholders` map and
 * nothing else. A pattern match over `<…>` would eat the runtime ones — and
 * three setup placeholders do not follow the `<your-…>` convention anyway.
 */

/**
 * @returns {{content: string, unresolved: Array<{token: string, key: string}>}}
 *   `unresolved` lists the setup placeholders still present because no answer
 *   was given. They stay in the file verbatim: an unfilled placeholder is a
 *   setup that did not finish, and the skill is written to stop on it.
 */
/**
 * Sections that exist only to explain the manual install.
 *
 * `/go`'s placeholder table is documentation *about* the placeholders. Left in
 * after rendering it reads « `collection://…` | the data source URI | example
 * `collection://…` » — a table describing a state that no longer exists. The
 * fence lets the file serve both routes: a manual installer copies it and sees
 * the table, the wizard strips it once the values are in.
 *
 * Stripped before substitution, so the tokens inside are never counted as
 * unresolved.
 */
const SETUP_ONLY = /[^\S\n]*<!--\s*arachnid:setup-only\s*-->[\s\S]*?<!--\s*\/arachnid:setup-only\s*-->\n?/g;

export function stripSetupOnly(content) {
  // Collapse the run of blank lines the removed block leaves behind, so the
  // rendered file does not carry a scar where the section used to be.
  return content.replace(SETUP_ONLY, '').replace(/\n{3,}/g, '\n\n');
}

export function render(content, placeholders, answers) {
  const unresolved = [];
  let out = stripSetupOnly(content);

  // Longest token first, so a placeholder that is a prefix of another cannot
  // eat it — `<Project name>` next to `<Project name and very basic
  // presentation>`. Order in the manifest then stops mattering.
  const ordered = Object.entries(placeholders).sort((a, b) => b[0].length - a[0].length);

  for (const [token, key] of ordered) {
    const value = answers[key];
    const missing = value === undefined || value === null || value === '';

    if (missing) {
      if (out.includes(token)) unresolved.push({ token, key });
      continue;
    }
    // split/join rather than a regex: the tokens contain `<`, `>` and `|`,
    // and escaping them for RegExp is a bug waiting to happen.
    out = out.split(token).join(String(value));
  }

  return { content: out, unresolved };
}

/** The declared setup placeholders still present in a rendered file. */
export function findUnresolved(content, placeholders) {
  return Object.entries(placeholders)
    .filter(([token]) => content.includes(token))
    .map(([token, key]) => ({ token, key }));
}
