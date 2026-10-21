import { nowIso } from './sqlite.js';

/** @param {Record<string, any> | undefined} row */
export function mapAccountRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: row.username,
    nickname: row.nickname,
    bio: row.bio,
    avatar: row.avatar,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 主库账号表的数据访问层。账号本身不保存密码：当前阶段没有登录，
 * 账号只作为「文章分库」的归属维度。
 */
export class AccountRepository {
  /** @param {import('node:sqlite').DatabaseSync} db */
  constructor(db) {
    this.db = db;
  }

  count() {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n);
  }

  /** @param {{ username: string, nickname?: string, bio?: string, avatar?: string }} input */
  create({ username, nickname = '', bio = '', avatar = '' }) {
    const now = nowIso();
    const info = this.db
      .prepare(
        `INSERT INTO accounts (username, nickname, bio, avatar, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(username, nickname || username, bio, avatar, now, now);
    return this.findById(Number(info.lastInsertRowid));
  }

  /** @param {number} id */
  findById(id) {
    return mapAccountRow(this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id));
  }

  /** @param {string} username */
  findByUsername(username) {
    return mapAccountRow(this.db.prepare('SELECT * FROM accounts WHERE username = ?').get(username));
  }

  list() {
    return this.db.prepare('SELECT * FROM accounts ORDER BY id ASC').all().map(mapAccountRow);
  }

  /**
   * @param {number} id
   * @param {{ nickname?: string, bio?: string, avatar?: string }} patch
   */
  updateProfile(id, patch) {
    const fields = [];
    const params = [];
    if (patch.nickname !== undefined) {
      fields.push('nickname = ?');
      params.push(patch.nickname);
    }
    if (patch.bio !== undefined) {
      fields.push('bio = ?');
      params.push(patch.bio);
    }
    if (patch.avatar !== undefined) {
      fields.push('avatar = ?');
      params.push(patch.avatar);
    }
    if (fields.length === 0) return this.findById(id);
    fields.push('updated_at = ?');
    params.push(nowIso(), id);
    this.db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  /** @param {number} id */
  remove(id) {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }
}
