import fs from 'node:fs';
import path from 'node:path';
import { AccountDatabases } from './account-dbs.js';
import { MasterDatabase } from './master.js';

export { AccountRepository } from './accounts.js';
export { ArticleRepository, ARTICLE_SCHEMA_VERSION } from './articles.js';
export { MasterDatabase, MASTER_SCHEMA_VERSION } from './master.js';
export { SettingsRepository, DEFAULT_SITE_SETTINGS } from './settings.js';
export { getSchemaVersion, withTransaction, nowIso } from './sqlite.js';

/**
 * 打开整套博客数据库：主库 + 账号文章库管理器。
 *
 * @param {{ dataDir: string }} options
 */
export function openBlogDatabase({ dataDir }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const masterFile = path.join(dataDir, 'master.db');
  const master = new MasterDatabase(masterFile);
  const accountDbs = new AccountDatabases(dataDir);

  return {
    dataDir,
    master,
    accountDbs,
    /** 返回某个账号的文章仓库（必要时创建账号库）。 */
    articlesFor(accountId) {
      return accountDbs.open(accountId).articles;
    },
    close() {
      accountDbs.closeAll();
      master.close();
    },
  };
}
