import fs from 'node:fs';
import path from 'node:path';
import { ARTICLE_SCHEMA_V1, ARTICLE_SCHEMA_VERSION, ArticleRepository } from './articles.js';
import { getSchemaVersion, openDatabase, setSchemaVersion, withTransaction } from './sqlite.js';

/**
 * 账号文章库管理器。
 *
 * 目录结构：
 *   data/master.db                     ← 主库：账号索引 + 站点配置
 *   data/accounts/account-1.db         ← 账号 1 的文章库（articles 表）
 *   data/accounts/account-2.db         ← 账号 2 的文章库
 *
 * 每个账号一个独立数据库文件，天然隔离；按需打开并缓存在内存里。
 */
export class AccountDatabases {
  /** @param {string} dataDir */
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'accounts');
    /** @type {Map<number, { db: import('node:sqlite').DatabaseSync, articles: ArticleRepository }>} */
    this.cache = new Map();
  }

  /** @param {number} accountId */
  fileFor(accountId) {
    const id = Number(accountId);
    if (!Number.isInteger(id) || id < 1) throw new Error(`非法的账号 ID: ${accountId}`);
    return path.join(this.dir, `account-${id}.db`);
  }

  /** @param {number} accountId */
  exists(accountId) {
    return fs.existsSync(this.fileFor(accountId));
  }

  /**
   * 打开（或复用）某个账号的文章库；文件不存在时创建并建表。
   * @param {number} accountId
   */
  open(accountId) {
    const id = Number(accountId);
    const cached = this.cache.get(id);
    if (cached) return cached;

    const db = openDatabase(this.fileFor(id));
    migrateAccountDatabase(db);
    const entry = { db, articles: new ArticleRepository(db) };
    this.cache.set(id, entry);
    return entry;
  }

  /** @param {number} accountId */
  get(accountId) {
    return this.open(accountId);
  }

  /** 关闭并删除某个账号的文章库（账号被移除时使用）。 */
  drop(accountId) {
    const id = Number(accountId);
    const cached = this.cache.get(id);
    if (cached) {
      cached.db.close();
      this.cache.delete(id);
    }
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${this.fileFor(id)}${suffix}`;
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    }
  }

  closeAll() {
    for (const { db } of this.cache.values()) {
      try {
        db.close();
      } catch {
        // 已关闭时忽略
      }
    }
    this.cache.clear();
  }
}

/** @param {import('node:sqlite').DatabaseSync} db */
function migrateAccountDatabase(db) {
  const version = getSchemaVersion(db);
  if (version > ARTICLE_SCHEMA_VERSION) {
    throw new Error(`账号库版本 ${version} 高于当前代码支持的版本 ${ARTICLE_SCHEMA_VERSION}`);
  }
  if (version < 1) {
    withTransaction(db, () => {
      db.exec(ARTICLE_SCHEMA_V1);
      setSchemaVersion(db, 1);
    });
  }
}
