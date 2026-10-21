import { nowIso } from './sqlite.js';

export const ARTICLE_SCHEMA_VERSION = 1;

/**
 * 每个账号库（data/accounts/account-<id>.db）里的「文章库」结构。
 * 账号之间物理隔离：不同账号的文章永远不会出现在同一张表里。
 */
export const ARTICLE_SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_articles_status_published
  ON articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_updated
  ON articles (updated_at DESC);
`;

/** @param {Record<string, any>} row */
export function mapArticleRow(row) {
  return {
    id: Number(row.id),
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content: row.content,
    cover: row.cover,
    tags: parseTags(row.tags),
    status: row.status,
    views: Number(row.views),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? null,
  };
}

function parseTags(raw) {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((tag) => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

/** 账号库中 articles 表的数据访问层（同步 API，由 node:sqlite 提供）。 */
export class ArticleRepository {
  /** @param {import('node:sqlite').DatabaseSync} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {{ title: string, slug: string, summary?: string, content?: string, cover?: string, tags?: string[], status?: 'draft'|'published' }} input
   */
  create({ title, slug, summary = '', content = '', cover = '', tags = [], status = 'draft' }) {
    const now = nowIso();
    const publishedAt = status === 'published' ? now : null;
    const info = this.db
      .prepare(
        `INSERT INTO articles (title, slug, summary, content, cover, tags, status, views, created_at, updated_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(title, slug, summary, content, cover, JSON.stringify(tags), status, now, now, publishedAt);
    return this.findById(Number(info.lastInsertRowid));
  }

  /** @param {number} id */
  findById(id) {
    const row = this.db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    return row ? mapArticleRow(row) : null;
  }

  /** @param {string} slug */
  findBySlug(slug) {
    const row = this.db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug);
    return row ? mapArticleRow(row) : null;
  }

  /**
   * 分页查询。
   * @param {{ status?: 'draft'|'published', keyword?: string, limit?: number, offset?: number }} [query]
   */
  list(query = {}) {
    const { status, keyword, limit = 20, offset = 0 } = query;
    const where = [];
    const params = [];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (keyword) {
      where.push('(title LIKE ? OR summary LIKE ? OR content LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) AS n FROM articles ${whereSql}`).get(...params).n,
    );
    const items = this.db
      .prepare(`SELECT * FROM articles ${whereSql} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)
      .map(mapArticleRow);
    return { total, items };
  }

  /** @param {number} [limit] */
  listPublished(limit = 20) {
    return this.db
      .prepare(
        `SELECT * FROM articles WHERE status = 'published'
         ORDER BY published_at DESC, id DESC LIMIT ?`,
      )
      .all(limit)
      .map(mapArticleRow);
  }

  /**
   * @param {number} id
   * @param {{ title?: string, summary?: string, content?: string, cover?: string, tags?: string[], status?: 'draft'|'published' }} patch
   */
  update(id, patch) {
    const current = this.findById(id);
    if (!current) return null;

    const fields = [];
    const params = [];
    const set = (column, value) => {
      fields.push(`${column} = ?`);
      params.push(value);
    };

    if (patch.title !== undefined) set('title', patch.title);
    if (patch.summary !== undefined) set('summary', patch.summary);
    if (patch.content !== undefined) set('content', patch.content);
    if (patch.cover !== undefined) set('cover', patch.cover);
    if (patch.tags !== undefined) set('tags', JSON.stringify(patch.tags));
    if (patch.status !== undefined && patch.status !== current.status) {
      set('status', patch.status);
      set('published_at', patch.status === 'published' ? nowIso() : null);
    }

    if (fields.length === 0) return current;
    set('updated_at', nowIso());
    this.db.prepare(`UPDATE articles SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
    return this.findById(id);
  }

  /**
   * 修改发布状态。
   * @param {number} id
   * @param {'draft'|'published'} status
   */
  setStatus(id, status) {
    return this.update(id, { status });
  }

  /** @param {number} id */
  incrementViews(id) {
    this.db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(id);
  }

  /** @param {{ status?: 'draft'|'published' }} [query] */
  count(query = {}) {
    const { status } = query;
    if (status) {
      return Number(this.db.prepare('SELECT COUNT(*) AS n FROM articles WHERE status = ?').get(status).n);
    }
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM articles').get().n);
  }

  /** @param {number} id */
  remove(id) {
    return this.db.prepare('DELETE FROM articles WHERE id = ?').run(id).changes > 0;
  }
}
