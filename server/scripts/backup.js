/**
 * 备份博客的所有 SQLite 库（主库 + 各账号文章库）。
 *
 * 使用 SQLite 的 `VACUUM INTO` 生成一致性快照，服务运行中执行也安全。
 *
 * 用法：
 *   BLOG_DATA_DIR=/var/lib/jk-blog/data \
 *   BLOG_BACKUP_DIR=/var/backups/jk-blog \
 *   node server/scripts/backup.js
 *
 * 可选环境变量：
 *   BLOG_BACKUP_KEEP=7   保留最近几个备份（默认 7）
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.env.BLOG_DATA_DIR || 'data');
const backupRoot = path.resolve(process.env.BLOG_BACKUP_DIR || 'backups');
const keep = Math.max(1, Number(process.env.BLOG_BACKUP_KEEP || 7));

const masterFile = path.join(dataDir, 'master.db');
if (!fs.existsSync(masterFile)) {
  console.error(`[backup] 找不到主库：${masterFile}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
const targetDir = path.join(backupRoot, stamp);
fs.mkdirSync(targetDir, { recursive: true });

const files = [masterFile];
const accountsDir = path.join(dataDir, 'accounts');
if (fs.existsSync(accountsDir)) {
  for (const name of fs.readdirSync(accountsDir).filter((item) => item.endsWith('.db')).sort()) {
    files.push(path.join(accountsDir, name));
  }
}

let copied = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const relative = path.relative(dataDir, file).replace(/[\\/]/g, '__');
  const target = path.join(targetDir, relative);
  const db = new DatabaseSync(file);
  try {
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    copied += 1;
  } finally {
    db.close();
  }
}

// 只保留最近 keep 个备份
const entries = fs
  .readdirSync(backupRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of entries.slice(0, Math.max(0, entries.length - keep))) {
  fs.rmSync(path.join(backupRoot, name), { recursive: true, force: true });
}

console.log(`[backup] 完成：${copied} 个库 -> ${targetDir}（保留最近 ${keep} 份）`);
