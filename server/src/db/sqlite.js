import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * 打开一个 SQLite 库（文件不存在会自动创建目录与库文件）。
 * 使用 Node.js 内置 node:sqlite，无第三方依赖。
 * @param {string} file
 * @returns {DatabaseSync}
 */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/**
 * 在一个事务里执行同步函数；抛错自动回滚。
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} fn
 * @returns {T}
 */
export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 回滚失败时保留原始错误
    }
    throw error;
  }
}

/** @param {DatabaseSync} db */
export function getSchemaVersion(db) {
  const row = db.prepare('PRAGMA user_version').get();
  return Number(row?.user_version ?? 0);
}

/** @param {DatabaseSync} db @param {number} version */
export function setSchemaVersion(db, version) {
  db.exec(`PRAGMA user_version = ${Number(version)}`);
}

/** @param {unknown} error */
export function isUniqueViolation(error) {
  return Boolean(error && typeof error.message === 'string' && /UNIQUE constraint failed/i.test(error.message));
}

export function nowIso() {
  return new Date().toISOString();
}
