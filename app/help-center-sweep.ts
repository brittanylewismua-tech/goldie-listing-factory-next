import { env } from "cloudflare:workers";
import { plainText, addedText, type Platform } from "@/app/platform-update-model";

/**
 * EVERY HELP ARTICLE, NOT THE ONES SOMEBODY REMEMBERED TO LIST.
 *
 * The brief used to watch nine hand-picked help articles: six at Etsy, three
 * at Printify. That is not a monitoring strategy, it is a list of the pages
 * whoever wrote it happened to think of, and it can only ever be as good as
 * that moment of recall. Etsy publishes 342 help articles and Printify 394.
 * A fee change, a policy rewrite or a new feature documented on any of the
 * other 727 was invisible, and the front page reported the silence as calm.
 *
 * Both run Zendesk, and Zendesk gives the whole help centre away: every
 * article, its full body, and when it last changed. So there is no reason to
 * choose. This sweeps all of them.
 *
 * WHY THE BODY IS HASHED AND NOT THE TIMESTAMP. Zendesk bumps updated_at for
 * its own housekeeping - the sample of Printify articles pulled while building
 * this had three articles "updated" within the same half hour, all carrying a
 * sys_rv_p1 revision label and no visible edit. Trusting updated_at would mean
 * summarising unchanged pages all night and calling routine maintenance news.
 * The stored body text decides whether anything actually changed; updated_at
 * only decides the order pages are pulled in.
 *
 * WHY THE FIRST RUN IS SILENT. On the first sweep all 736 articles are
 * "new". Reporting them would announce every standing rule Etsy and Printify
 * have as a change, which is the single worst thing this feature could do.
 */

const HOST: Record<Platform, string> = {
  Etsy: "help.etsy.com",
  Printify: "help.printify.com",
};
const PER_PAGE = 100;
/* 342 and 394 today. Five pages leaves room to grow without a code change. */
const MAX_PAGES = 5;
/* An edit smaller than this is a typo or a reflow, not an announcement. */
const MIN_ADDED = 40;

export type ArticleChange = {
  platform: Platform; articleId: number; title: string; url: string;
  previous: string; current: string; added: string; isNew: boolean;
};

const db = () => (env as unknown as { DB: D1Database }).DB;

export async function ensureHelpArticleTable() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS help_article_state (
      platform TEXT NOT NULL,
      article_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      checked_at INTEGER NOT NULL,
      PRIMARY KEY (platform, article_id))`),
    db().prepare(`CREATE INDEX IF NOT EXISTS help_article_platform
      ON help_article_state (platform)`),
  ]);
}

type Fetched = { id: number; title: string; url: string; text: string };

async function readAll(platform: Platform): Promise<Fetched[]> {
  const out: Fetched[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetch(
      `https://${HOST[platform]}/api/v2/help_center/en-us/articles.json`
      + `?sort_by=updated_at&sort_order=desc&per_page=${PER_PAGE}&page=${page}`,
      { headers: { "User-Agent": "GoldieSuite/1.0 (official platform update monitor)",
        Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${platform} help centre returned ${response.status}`);
    const body = await response.json() as {
      articles?: Array<{ id?: unknown; title?: unknown; html_url?: unknown;
        body?: unknown; draft?: unknown }>; next_page?: string | null };
    const rows = body.articles ?? [];
    if (!Array.isArray(rows)) throw new Error(`${platform} help centre could not be read`);
    for (const row of rows) {
      if (row.draft) continue;
      const id = Number(row.id);
      if (!(id > 0)) continue;
      const title = String(row.title ?? "").trim();
      out.push({ id, title,
        url: String(row.html_url ?? `https://${HOST[platform]}/hc/en-us/articles/${id}`),
        text: `${title}\n${plainText(String(row.body ?? ""))}`.slice(0, 60000) });
    }
    if (!body.next_page) break;
  }
  if (!out.length) throw new Error(`${platform} help centre came back empty`);
  return out;
}

/**
 * Returns the articles whose text actually changed, newest first, capped at
 * `maxChanges`. Anything over the cap keeps its OLD stored body, so the next
 * sweep still sees it as changed rather than losing it to a silent overwrite.
 */
export async function sweepHelpCentre(
  platform: Platform, now: number, maxChanges: number,
): Promise<{ scanned: number; changes: ArticleChange[]; baseline: boolean }> {
  await ensureHelpArticleTable();
  const articles = await readAll(platform);

  const stored = await db()
    .prepare(`SELECT article_id AS id, body FROM help_article_state WHERE platform = ?`)
    .bind(platform).all<{ id: number; body: string }>();
  const known = new Map((stored.results ?? []).map(row => [Number(row.id), String(row.body ?? "")]));

  const save = (row: Fetched) => db().prepare(
    `INSERT INTO help_article_state(platform,article_id,title,url,body,checked_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(platform,article_id) DO UPDATE SET
       title=excluded.title,url=excluded.url,body=excluded.body,checked_at=excluded.checked_at`)
    .bind(platform, row.id, row.title, row.url, row.text, now).run();

  /* First sweep: learn the whole help centre, announce none of it. */
  if (!known.size) {
    for (const row of articles) await save(row);
    return { scanned: articles.length, changes: [], baseline: true };
  }

  const changes: ArticleChange[] = [];
  for (const row of articles) {
    const previous = known.get(row.id);
    const isNew = previous === undefined;
    const added = isNew ? row.text : addedText(previous, row.text);
    const changed = isNew || (previous !== row.text && added.length >= MIN_ADDED);
    if (changed && changes.length < maxChanges) {
      changes.push({ platform, articleId: row.id, title: row.title, url: row.url,
        previous: previous ?? "", current: row.text, added, isNew });
      await save(row);
      continue;
    }
    /* Over the cap, leave the old body in place so it is still pending next
       time. Unchanged articles only need their checked_at moved on. */
    if (changed) continue;
    await db().prepare(
      `UPDATE help_article_state SET title=?,url=?,checked_at=? WHERE platform=? AND article_id=?`)
      .bind(row.title, row.url, now, platform, row.id).run();
  }
  return { scanned: articles.length, changes, baseline: false };
}
