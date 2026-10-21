/**
 * 修改主库 site_settings 里的站点配置。
 *
 * 用法（会复用当前环境变量，比如 BLOG_DATA_DIR）：
 *   node server/scripts/set-setting.js title "刀盾的小屋"
 *   node server/scripts/set-setting.js footer "© 2026 刀盾 · 用 SQLite 写下每一个字"
 */
import { createApp } from '../src/app.js';

const [key, ...rest] = process.argv.slice(2);
const value = rest.join(' ');

if (!key || value === '') {
  console.error('用法: node server/scripts/set-setting.js <key> <value>');
  process.exit(2);
}

const app = createApp();
try {
  const updated = app.db.master.settings.set(key, value);
  console.log(`已更新 ${key} = ${updated}`);
} finally {
  app.close();
}
