import { nowIso, withTransaction } from './sqlite.js';

/** 站点默认配置：首次启动时写入主库，之后可在库里改。 */
export const DEFAULT_SITE_SETTINGS = Object.freeze({
  title: '刀盾的小屋',
  subtitle: '在代码与星光之间，写一点想写的东西。',
  description: '一个用 Node.js 和 SQLite 写成的博客，记录代码、文字与一点星光。',
  owner: 'DaoDun',
  mascotName: '小星',
  mascotLine: '欢迎回来，今天也一起写点什么吧～',
  footer: '© 2026 DaoDun · 用 SQLite 写下每一个字',
  aboutTitle: '关于这个小站',
  aboutText:
    '一个用 **Node.js + SQLite** 搭起来的个人博客：主库登记账号，每个账号拥有独立的文章库；前端原生 HTML / CSS / JavaScript，没有构建步骤。',
  aboutTags: 'Node.js,SQLite,Vanilla JS,账号分库,零依赖',
});

/** 主库 site_settings 表的数据访问层（key-value 形式，方便以后扩展）。 */
export class SettingsRepository {
  /** @param {import('node:sqlite').DatabaseSync} db */
  constructor(db) {
    this.db = db;
  }

  seedDefaults() {
    const now = nowIso();
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)',
    );
    withTransaction(this.db, () => {
      for (const [key, value] of Object.entries(DEFAULT_SITE_SETTINGS)) {
        insert.run(key, value, now);
      }
    });
  }

  /** @returns {Record<string, string>} */
  all() {
    const result = { ...DEFAULT_SITE_SETTINGS };
    for (const row of this.db.prepare('SELECT key, value FROM site_settings').all()) {
      result[row.key] = row.value;
    }
    return result;
  }

  /** @param {string} key */
  get(key) {
    const row = this.db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
    return row ? row.value : DEFAULT_SITE_SETTINGS[key];
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    this.db
      .prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, String(value), nowIso());
    return this.get(key);
  }
}
