import { getSchemaVersion, openDatabase, setSchemaVersion, withTransaction } from './sqlite.js';
import { AccountRepository } from './accounts.js';
import { SettingsRepository } from './settings.js';

export const MASTER_SCHEMA_VERSION = 1;

/**
 * 主库（data/master.db）：只存「账号索引」与站点配置。
 * 文章不在这里，每个账号有自己独立的文章库文件。
 */
export const MASTER_SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export class MasterDatabase {
  /** @param {string} file */
  constructor(file) {
    this.file = file;
    this.db = openDatabase(file);
    this.migrate();
    this.accounts = new AccountRepository(this.db);
    this.settings = new SettingsRepository(this.db);
    this.settings.seedDefaults();
  }

  migrate() {
    const version = getSchemaVersion(this.db);
    if (version > MASTER_SCHEMA_VERSION) {
      throw new Error(`主库版本 ${version} 高于当前代码支持的版本 ${MASTER_SCHEMA_VERSION}`);
    }
    if (version < 1) {
      withTransaction(this.db, () => {
        this.db.exec(MASTER_SCHEMA_V1);
        setSchemaVersion(this.db, 1);
      });
    }
  }

  close() {
    this.db.close();
  }
}
