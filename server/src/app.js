import { loadConfig } from './config.js';
import { openBlogDatabase } from './db/index.js';
import { buildRouter } from './routes/index.js';
import { createRequestHandler } from './server.js';
import { AccountService } from './services/accounts.js';
import { ArticleService } from './services/articles.js';
import { BlogService } from './services/blog.js';

/**
 * 创建应用：打开数据库、组装服务与路由。
 * 测试时通过 overrides 指定临时 dataDir。
 * @param {{ dataDir?: string, port?: number, host?: string, webDir?: string }} [overrides]
 */
export function createApp(overrides = {}) {
  const config = { ...loadConfig(), ...overrides };
  const db = openBlogDatabase({ dataDir: config.dataDir });

  const services = {
    accounts: new AccountService(db),
    articles: new ArticleService(db),
    blog: new BlogService(db),
  };

  const router = buildRouter({ services });
  const handler = createRequestHandler({ config, router });

  return {
    config,
    db,
    services,
    router,
    handler,
    close() {
      db.close();
    },
  };
}
