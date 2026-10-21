import { Router } from '../lib/http.js';

/**
 * 公开只读 API。当前阶段没有登录/注册，因此不暴露写接口；
 * 写入能力在 services/ 与 db/ 里（种子脚本、测试、以后的写接口复用）。
 * @param {{ services: { accounts: any, articles: any, blog: any } }} options
 */
export function buildRouter({ services }) {
  const router = new Router();

  router.get('/api/health', () => ({
    ok: true,
    service: 'jk-blog',
    version: '0.1.0',
    time: new Date().toISOString(),
  }));

  router.get('/api/site', () => ({ site: services.blog.getSite() }));

  router.get('/api/stats', () => services.blog.getStats());

  router.get('/api/feed', (ctx) => {
    const raw = ctx.query.get('limit');
    const limit = raw === null ? 6 : Number(raw);
    return services.blog.latest(limit);
  });

  router.get('/api/accounts', () => ({ items: services.blog.listAccounts() }));

  router.get('/api/accounts/:username', (ctx) => ({
    account: services.accounts.getByUsername(ctx.params.username),
  }));

  router.get('/api/accounts/:username/articles', (ctx) =>
    services.blog.accountArticles(ctx.params.username, Object.fromEntries(ctx.query)),
  );

  router.get('/api/public/articles/:username/:id', (ctx) =>
    services.blog.publicArticle(ctx.params.username, ctx.params.id),
  );

  return router;
}
