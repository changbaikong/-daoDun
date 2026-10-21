import { notFound, validationError } from '../lib/errors.js';
import { slugify } from '../lib/slug.js';
import { readEnum, readInt, readString, readTags } from '../lib/validate.js';

export const ARTICLE_STATUSES = Object.freeze(['draft', 'published']);

/**
 * 文章业务服务：校验输入、生成唯一 slug、读写某个账号库里的文章。
 * 说明：HTTP 层目前只开放只读接口；写能力先通过这个服务（种子脚本、测试、以后的写接口）使用。
 */
export class ArticleService {
  /** @param {ReturnType<import('../db/index.js').openBlogDatabase>} db */
  constructor(db) {
    this.db = db;
  }

  /** @param {number} accountId */
  repo(accountId) {
    return this.db.accountDbs.get(accountId).articles;
  }

  /**
   * 新建文章（写入 accountId 对应的独立文章库）。
   * @param {number} accountId
   * @param {Record<string, unknown>} input
   */
  create(accountId, input) {
    const title = readString(input, 'title', { required: true, label: '标题', max: 200 });
    const summary = readString(input, 'summary', { label: '摘要', max: 500 }) || '';
    const content = readString(input, 'content', { label: '正文', max: 200_000, trim: false }) || '';
    const cover = readString(input, 'cover', { label: '封面', max: 500 }) || '';
    const tags = readTags(input) || [];
    const status = readEnum(input, 'status', ARTICLE_STATUSES, { label: '状态', defaultValue: 'draft' });

    const repo = this.repo(accountId);
    const base = slugify(title);
    let slug = base;
    for (let index = 2; repo.findBySlug(slug); index += 1) {
      slug = `${base}-${index}`;
    }

    return repo.create({ title, slug, summary, content, cover, tags, status });
  }

  /**
   * 分页查询某个账号库里的文章。
   * @param {number} accountId
   * @param {Record<string, unknown>} [query]
   */
  list(accountId, query = {}) {
    const status = readEnum(query, 'status', ARTICLE_STATUSES, { label: '状态' });
    const keyword = readString(query, 'keyword', { label: '关键词', max: 100 });
    const limit = readInt(query, 'limit', { label: '每页数量', min: 1, max: 100, defaultValue: 20 });
    const offset = readInt(query, 'offset', { label: '偏移量', min: 0, max: 1_000_000, defaultValue: 0 });
    return this.repo(accountId).list({ status, keyword, limit, offset });
  }

  /**
   * @param {number} accountId
   * @param {number|string} articleId
   */
  get(accountId, articleId) {
    const id = readInt({ id: articleId }, 'id', { label: '文章 ID', min: 1 });
    const article = this.repo(accountId).findById(id);
    if (!article) throw notFound('文章不存在');
    return article;
  }

  /**
   * 更新文章（只更新传入的字段）。
   * @param {number} accountId
   * @param {number|string} articleId
   * @param {Record<string, unknown>} input
   */
  update(accountId, articleId, input) {
    const current = this.get(accountId, articleId);
    const patch = {};

    const title = readString(input, 'title', { label: '标题', max: 200 });
    const summary = readString(input, 'summary', { label: '摘要', max: 500 });
    const content = readString(input, 'content', { label: '正文', max: 200_000, trim: false });
    const cover = readString(input, 'cover', { label: '封面', max: 500 });
    const tags = readTags(input);
    const status = readEnum(input, 'status', ARTICLE_STATUSES, { label: '状态' });

    if (title !== undefined) {
      if (title.length === 0) throw validationError({ title: '标题不能为空' });
      patch.title = title;
    }
    if (summary !== undefined) patch.summary = summary;
    if (content !== undefined) patch.content = content;
    if (cover !== undefined) patch.cover = cover;
    if (tags !== undefined) patch.tags = tags;
    if (status !== undefined) patch.status = status;

    const updated = this.repo(accountId).update(current.id, patch);
    if (!updated) throw notFound('文章不存在');
    return updated;
  }

  /**
   * @param {number} accountId
   * @param {number|string} articleId
   * @param {'draft'|'published'} status
   */
  setStatus(accountId, articleId, status) {
    const current = this.get(accountId, articleId);
    return this.repo(accountId).setStatus(current.id, status);
  }

  /**
   * @param {number} accountId
   * @param {number|string} articleId
   */
  remove(accountId, articleId) {
    const current = this.get(accountId, articleId);
    this.repo(accountId).remove(current.id);
    return current;
  }
}
