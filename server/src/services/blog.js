import { notFound } from '../lib/errors.js';
import { readInt } from '../lib/validate.js';

/** 从账号记录里挑出可公开的字段。 */
function toAuthor(account) {
  return {
    id: account.id,
    username: account.username,
    nickname: account.nickname,
    avatar: account.avatar,
  };
}

/** 列表/Feed 里不返回正文，减少传输体积。 */
function toArticleSummary(article, account) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    excerpt: toExcerpt(article.content),
    cover: article.cover,
    tags: article.tags,
    views: article.views,
    status: article.status,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    author: toAuthor(account),
  };
}

function toExcerpt(content, maxLength = 96) {
  const plain = String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

/**
 * 只读博客服务：给 HTTP 公开接口用的查询聚合层。
 * 它会跨账号读取各自的文章库，但对调用方隐藏「分库」细节。
 */
export class BlogService {
  /** @param {ReturnType<import('../db/index.js').openBlogDatabase>} db */
  constructor(db) {
    this.db = db;
  }

  getSite() {
    return this.db.master.settings.all();
  }

  getStats() {
    const accounts = this.db.master.accounts.list();
    let articles = 0;
    let published = 0;
    for (const account of accounts) {
      const repo = this.db.accountDbs.get(account.id).articles;
      articles += repo.count();
      published += repo.count({ status: 'published' });
    }
    return { accounts: accounts.length, articles, published };
  }

  /**
   * 跨账号最新文章。
   * @param {number} [limit]
   */
  latest(limit = 6) {
    const size = Math.min(Math.max(Number(limit) || 6, 1), 20);
    const accounts = this.db.master.accounts.list();
    const items = [];
    for (const account of accounts) {
      const repo = this.db.accountDbs.get(account.id).articles;
      for (const article of repo.listPublished(size)) {
        items.push(toArticleSummary(article, account));
      }
    }
    items.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
    return { items: items.slice(0, size) };
  }

  /** 所有账号 + 各自的文章统计。 */
  listAccounts() {
    return this.db.master.accounts.list().map((account) => {
      const repo = this.db.accountDbs.get(account.id).articles;
      return {
        ...toAuthor(account),
        bio: account.bio,
        createdAt: account.createdAt,
        stats: {
          articles: repo.count(),
          published: repo.count({ status: 'published' }),
        },
      };
    });
  }

  /**
   * 某个账号下已发布的文章列表。
   * @param {string} username
   * @param {Record<string, unknown>} [query]
   */
  accountArticles(username, query = {}) {
    const account = this.requireAccount(username);
    const limit = readInt(query, 'limit', { label: '每页数量', min: 1, max: 50, defaultValue: 10 });
    const offset = readInt(query, 'offset', { label: '偏移量', min: 0, max: 1_000_000, defaultValue: 0 });
    const repo = this.db.accountDbs.get(account.id).articles;
    const items = repo
      .list({ status: 'published', limit, offset })
      .items.map((article) => toArticleSummary(article, account));
    return {
      account: {
        ...toAuthor(account),
        bio: account.bio,
        stats: { articles: repo.count(), published: repo.count({ status: 'published' }) },
      },
      items,
    };
  }

  /**
   * 公开阅读单篇文章，并累加阅读量。
   * @param {string} username
   * @param {number|string} articleId
   */
  publicArticle(username, articleId) {
    const account = this.requireAccount(username);
    const id = readInt({ id: articleId }, 'id', { label: '文章 ID', min: 1 });
    const repo = this.db.accountDbs.get(account.id).articles;
    const article = repo.findById(id);
    if (!article || article.status !== 'published') throw notFound('文章不存在或尚未发布');
    repo.incrementViews(article.id);
    return {
      article: { ...article, views: article.views + 1 },
      author: toAuthor(account),
    };
  }

  /** @param {string} username */
  requireAccount(username) {
    const account = this.db.master.accounts.findByUsername(String(username || '').toLowerCase());
    if (!account) throw notFound('账号不存在');
    return account;
  }
}
