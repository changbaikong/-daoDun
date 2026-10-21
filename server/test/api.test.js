import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestApp, fetchJson, startTestServer } from './helpers.js';

function seedData(app) {
  const { services } = app;
  const alice = services.accounts.create({ username: 'alice', nickname: '爱丽丝', bio: '测试作者' });
  const bob = services.accounts.create({ username: 'bob', nickname: '鲍勃' });
  const star = services.articles.create(alice.id, {
    title: '第一篇：星光',
    summary: '摘要一',
    content: '# 你好\n\n正文一',
    tags: ['随笔'],
    status: 'published',
  });
  const draft = services.articles.create(alice.id, {
    title: '第二篇：草稿',
    content: '正文二',
    status: 'draft',
  });
  const bobPost = services.articles.create(bob.id, {
    title: '鲍勃的文章',
    content: '正文三',
    tags: ['日常'],
    status: 'published',
  });
  return { alice, bob, star, draft, bobPost };
}

test('公开 API：站点、统计、Feed、账号、文章列表与详情', async () => {
  const { app, cleanup } = createTestApp();
  const { baseUrl, close } = await startTestServer(app);
  try {
    const data = seedData(app);

    const health = await fetchJson(baseUrl, '/api/health');
    assert.equal(health.res.status, 200);
    assert.equal(health.data.ok, true);

    const site = await fetchJson(baseUrl, '/api/site');
    assert.equal(site.res.status, 200);
    assert.equal(site.data.site.title, '刀盾的小屋');
    assert.equal(site.data.site.aboutTitle, '关于这个小站');
    assert.ok(site.data.site.aboutTags.includes('SQLite'));

    const stats = await fetchJson(baseUrl, '/api/stats');
    assert.deepEqual(stats.data, { accounts: 2, articles: 3, published: 2 });

    const feed = await fetchJson(baseUrl, '/api/feed?limit=10');
    assert.equal(feed.res.status, 200);
    assert.equal(feed.data.total, 2);
    assert.equal(feed.data.items.length, 2);
    assert.deepEqual(
      new Set(feed.data.items.map((item) => item.title)),
      new Set(['第一篇：星光', '鲍勃的文章']),
    );
    assert.equal(feed.data.items[0].content, undefined, 'Feed 列表不应返回正文');

    // 第二页：limit / offset 分页，total 用于前端判断「加载更多」
    const firstPage = await fetchJson(baseUrl, '/api/feed?limit=1');
    const secondPage = await fetchJson(baseUrl, '/api/feed?limit=1&offset=1');
    assert.equal(firstPage.data.items.length, 1);
    assert.equal(secondPage.res.status, 200);
    assert.equal(secondPage.data.total, 2);
    assert.equal(secondPage.data.items.length, 1);
    assert.notEqual(firstPage.data.items[0].title, secondPage.data.items[0].title);

    const emptyPage = await fetchJson(baseUrl, '/api/feed?limit=10&offset=10');
    assert.equal(emptyPage.data.total, 2);
    assert.equal(emptyPage.data.items.length, 0, '越界偏移返回空列表');

    const accounts = await fetchJson(baseUrl, '/api/accounts');
    assert.equal(accounts.data.items.length, 2);
    const aliceCard = accounts.data.items.find((item) => item.username === 'alice');
    assert.equal(aliceCard.stats.articles, 2);
    assert.equal(aliceCard.stats.published, 1);
    assert.equal(aliceCard.nickname, '爱丽丝');

    const account = await fetchJson(baseUrl, '/api/accounts/alice');
    assert.equal(account.res.status, 200);
    assert.equal(account.data.account.username, 'alice');
    assert.equal(account.data.account.stats.published, 1);

    const aliceArticles = await fetchJson(baseUrl, '/api/accounts/alice/articles');
    assert.equal(aliceArticles.data.items.length, 1, '只返回已发布文章');
    assert.equal(aliceArticles.data.items[0].id, data.star.id);
    assert.equal(aliceArticles.data.total, 1, '账号文章列表返回已发布总数');

    const detail = await fetchJson(baseUrl, `/api/public/articles/alice/${data.star.id}`);
    assert.equal(detail.res.status, 200);
    assert.equal(detail.data.article.title, '第一篇：星光');
    assert.match(detail.data.article.content, /你好/);
    assert.equal(detail.data.article.views, 1);
    assert.equal(detail.data.author.nickname, '爱丽丝');

    const secondRead = await fetchJson(baseUrl, `/api/public/articles/alice/${data.star.id}`);
    assert.equal(secondRead.data.article.views, 2, '每次阅读累加阅读量');

    const draftRead = await fetchJson(baseUrl, `/api/public/articles/alice/${data.draft.id}`);
    assert.equal(draftRead.res.status, 404);

    const missingAccount = await fetchJson(baseUrl, '/api/accounts/nobody/articles');
    assert.equal(missingAccount.res.status, 404);
  } finally {
    await close();
    cleanup();
  }
});

test('API 错误处理：404、405、OPTIONS 与参数校验', async () => {
  const { app, cleanup } = createTestApp();
  const { baseUrl, close } = await startTestServer(app);
  try {
    seedData(app);

    const missing = await fetchJson(baseUrl, '/api/nope');
    assert.equal(missing.res.status, 404);
    assert.equal(missing.data.error.code, 'NOT_FOUND');

    const wrongMethod = await fetchJson(baseUrl, '/api/health', { method: 'POST' });
    assert.equal(wrongMethod.res.status, 405);
    assert.match(wrongMethod.data.error.details.allowed, /GET/);

    const options = await fetch(baseUrl + '/api/feed', { method: 'OPTIONS' });
    assert.equal(options.status, 204);

    const badLimit = await fetchJson(baseUrl, '/api/accounts/alice/articles?limit=0');
    assert.equal(badLimit.res.status, 422);
    assert.equal(badLimit.data.error.code, 'VALIDATION_ERROR');

    const badOffset = await fetchJson(baseUrl, '/api/accounts/alice/articles?offset=-1');
    assert.equal(badOffset.res.status, 422);

    const badFeedLimit = await fetchJson(baseUrl, '/api/feed?limit=99');
    assert.equal(badFeedLimit.res.status, 422);
    const badFeedOffset = await fetchJson(baseUrl, '/api/feed?offset=-1');
    assert.equal(badFeedOffset.res.status, 422);

    const badId = await fetchJson(baseUrl, '/api/public/articles/alice/not-a-number');
    assert.equal(badId.res.status, 422);
  } finally {
    await close();
    cleanup();
  }
});

test('静态资源：首页、CSS/JS MIME、安全头、HEAD、目录穿越防护', async () => {
  const { app, cleanup } = createTestApp();
  const { baseUrl, close } = await startTestServer(app);
  try {
    const home = await fetch(baseUrl + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type') || '', /text\/html/);
    const html = await home.text();
    assert.match(html, /看板娘/);
    assert.match(html, /\/css\/style\.css/);
    assert.match(html, /\/js\/app\.js/);

    const css = await fetch(baseUrl + '/css/style.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') || '', /text\/css/);
    assert.match(await css.text(), /\.hero/);

    const js = await fetch(baseUrl + '/js/app.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') || '', /javascript/);

    // 首页只保留文章区，「关于」改为独立页面
    assert.doesNotMatch(html, /id="about-text"/);
    const about = await fetch(baseUrl + '/about');
    assert.equal(about.status, 200);
    assert.match(about.headers.get('content-type') || '', /text\/html/);
    const aboutHtml = await about.text();
    assert.match(aboutHtml, /id="about-text"/);
    assert.match(aboutHtml, /\/js\/about\.js/);

    const aboutJs = await fetch(baseUrl + '/js/about.js');
    assert.equal(aboutJs.status, 200);
    assert.match(aboutJs.headers.get('content-type') || '', /javascript/);

    // 第二页：文章列表 /articles（无扩展名 → articles.html，带斜杠也兼容）
    const articlesPage = await fetch(baseUrl + '/articles');
    assert.equal(articlesPage.status, 200);
    assert.match(articlesPage.headers.get('content-type') || '', /text\/html/);
    const articlesHtml = await articlesPage.text();
    assert.match(articlesHtml, /id="post-list"/);
    assert.match(articlesHtml, /\/js\/articles\.js/);

    const articlesTrailing = await fetch(baseUrl + '/articles/');
    assert.equal(articlesTrailing.status, 200);
    assert.match(await articlesTrailing.text(), /id="post-list"/);

    // 文章详情是独立页面：/articles/:username/:id → article.html
    const articlePage = await fetch(baseUrl + '/articles/alice/1');
    assert.equal(articlePage.status, 200);
    assert.match(articlePage.headers.get('content-type') || '', /text\/html/);
    const articleHtml = await articlePage.text();
    assert.match(articleHtml, /id="article-body"/);
    assert.match(articleHtml, /\/js\/article\.js/);

    const articlesJs = await fetch(baseUrl + '/js/articles.js');
    assert.equal(articlesJs.status, 200);
    assert.match(articlesJs.headers.get('content-type') || '', /javascript/);
    const articleJs = await fetch(baseUrl + '/js/article.js');
    assert.equal(articleJs.status, 200);
    assert.match(articleJs.headers.get('content-type') || '', /javascript/);

    const head = await fetch(baseUrl + '/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');

    const api = await fetch(baseUrl + '/api/health');
    assert.equal(api.headers.get('x-content-type-options'), 'nosniff');
    assert.match(api.headers.get('content-security-policy') || '', /default-src 'self'/);

    const notFoundAsset = await fetch(baseUrl + '/assets/not-exist.png');
    assert.equal(notFoundAsset.status, 404);

    const traversal = await fetch(baseUrl + '/..%2Fpackage.json');
    assert.ok([403, 404].includes(traversal.status), `目录穿越应被拦截，实际状态码 ${traversal.status}`);
    assert.doesNotMatch(await traversal.text(), /"name": "jk-blog"/);
  } finally {
    await close();
    cleanup();
  }
});
