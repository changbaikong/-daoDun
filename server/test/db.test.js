import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ARTICLE_SCHEMA_VERSION,
  MASTER_SCHEMA_VERSION,
  getSchemaVersion,
} from '../src/db/index.js';
import { createTestApp } from './helpers.js';

function expectStatus(error, status) {
  return Boolean(error) && error.status === status;
}

test('主库初始化：版本号、默认站点配置、账号库按需创建', () => {
  const { app, dataDir, cleanup } = createTestApp();
  try {
    assert.equal(getSchemaVersion(app.db.master.db), MASTER_SCHEMA_VERSION);
    assert.ok(fs.existsSync(path.join(dataDir, 'master.db')));

    const site = app.services.blog.getSite();
    assert.equal(site.title, 'Jk 的博客');
    assert.ok(site.mascotName.length > 0);
    assert.ok(site.subtitle.length > 0);

    const account = app.services.accounts.create({ username: 'alice', nickname: '爱丽丝' });
    const accountFile = path.join(dataDir, 'accounts', `account-${account.id}.db`);
    assert.ok(fs.existsSync(accountFile), '创建账号时应同时创建账号文章库文件');

    const accountDb = app.db.accountDbs.open(account.id);
    assert.equal(getSchemaVersion(accountDb.db), ARTICLE_SCHEMA_VERSION);

    // 直接写库时，数据库 CHECK 约束也应该兜底
    assert.throws(() => {
      accountDb.articles.create({ title: '异常状态', slug: 'bad-status', status: 'whatever' });
    }, /CHECK constraint failed/i);
  } finally {
    cleanup();
  }
});

test('站点配置读写：保存在主库 site_settings 表', () => {
  const { app, cleanup } = createTestApp();
  try {
    app.db.master.settings.set('title', '测试站点');
    assert.equal(app.db.master.settings.get('title'), '测试站点');
    assert.equal(app.services.blog.getSite().title, '测试站点');
  } finally {
    cleanup();
  }
});

test('账号隔离：不同账号的文章库互不可见', () => {
  const { app, cleanup } = createTestApp();
  try {
    const alice = app.services.accounts.create({ username: 'alice', nickname: '爱丽丝' });
    const bob = app.services.accounts.create({ username: 'bob', nickname: '鲍勃' });

    const alicePost = app.services.articles.create(alice.id, {
      title: 'Alice 的私人文章',
      status: 'published',
      tags: ['私密'],
    });
    app.services.articles.create(bob.id, { title: 'Bob 的文章', status: 'draft' });

    assert.equal(app.services.articles.list(alice.id).total, 1);
    assert.equal(app.services.articles.list(bob.id).total, 1);
    assert.equal(app.services.articles.list(bob.id).items[0].title, 'Bob 的文章');

    const alicePublic = app.services.blog.accountArticles('alice').items;
    assert.equal(alicePublic.length, 1);
    assert.equal(alicePublic[0].id, alicePost.id);
    assert.equal(app.services.blog.accountArticles('bob').items.length, 0, '草稿不应公开');

    const feed = app.services.blog.latest();
    assert.equal(feed.items.length, 1);
    assert.equal(feed.items[0].author.username, 'alice');
    assert.equal(feed.items[0].content, undefined, 'Feed 不应携带正文');

    const accountsDir = path.join(app.config.dataDir, 'accounts');
    assert.ok(fs.existsSync(path.join(accountsDir, `account-${alice.id}.db`)));
    assert.ok(fs.existsSync(path.join(accountsDir, `account-${bob.id}.db`)));
  } finally {
    cleanup();
  }
});

test('文章库 CRUD：slug 唯一、发布状态、关键词检索、阅读量', () => {
  const { app, cleanup } = createTestApp();
  try {
    const { services } = app;
    const account = services.accounts.create({ username: 'writer', nickname: '写作者' });

    const first = services.articles.create(account.id, {
      title: 'Hello World',
      summary: '第一篇',
      content: '正文里有猫',
      tags: '随笔, 测试',
      status: 'draft',
    });
    assert.equal(first.slug, 'hello-world');
    assert.deepEqual(first.tags, ['随笔', '测试']);
    assert.equal(first.status, 'draft');
    assert.equal(first.publishedAt, null);

    const second = services.articles.create(account.id, {
      title: 'Hello World',
      status: 'published',
    });
    assert.equal(second.slug, 'hello-world-2', '同标题应生成不同的 slug');
    assert.ok(second.publishedAt, '发布时应写入 publishedAt');

    const published = services.articles.setStatus(account.id, first.id, 'published');
    assert.equal(published.status, 'published');
    assert.ok(published.publishedAt);

    const updated = services.articles.update(account.id, first.id, {
      title: 'Hello World 改名',
      content: '更新后的内容',
    });
    assert.equal(updated.title, 'Hello World 改名');
    assert.equal(updated.slug, 'hello-world', 'slug 应保持稳定');

    assert.equal(services.articles.list(account.id, { keyword: '更新后的内容' }).total, 1);
    assert.equal(services.articles.list(account.id, { status: 'published' }).total, 2);
    assert.equal(services.blog.accountArticles('writer').items.length, 2);

    const detail = services.blog.publicArticle('writer', first.id);
    assert.equal(detail.article.views, 1);
    assert.equal(services.blog.publicArticle('writer', first.id).article.views, 2);

    const draft = services.articles.create(account.id, { title: '草稿不该公开', status: 'draft' });
    assert.throws(
      () => services.blog.publicArticle('writer', draft.id),
      (error) => expectStatus(error, 404),
    );

    services.articles.remove(account.id, second.id);
    assert.equal(services.articles.list(account.id).total, 2);
    assert.equal(services.articles.list(account.id, { status: 'published' }).total, 1);
  } finally {
    cleanup();
  }
});

test('输入校验：账号名、重复账号、文章字段与 404 边界', () => {
  const { app, cleanup } = createTestApp();
  try {
    const { services } = app;

    assert.throws(() => services.accounts.create({ username: '1bad' }), (error) => expectStatus(error, 422));
    assert.throws(() => services.accounts.create({ username: 'a' }), (error) => expectStatus(error, 422));
    assert.throws(() => services.accounts.create({ username: 'with space' }), (error) => expectStatus(error, 422));

    const account = services.accounts.create({ username: 'alice' });
    assert.throws(() => services.accounts.create({ username: 'alice' }), (error) => expectStatus(error, 409));

    assert.throws(() => services.articles.create(account.id, { title: '' }), (error) => expectStatus(error, 422));
    assert.throws(() => services.articles.create(account.id, { title: '   ' }), (error) => expectStatus(error, 422));
    assert.throws(
      () => services.articles.create(account.id, { title: '标签太多', tags: 'a,b,c,d,e,f,g,h,i' }),
      (error) => expectStatus(error, 422),
    );
    assert.throws(
      () => services.articles.create(account.id, { title: '状态错误', status: 'deleted' }),
      (error) => expectStatus(error, 422),
    );
    assert.throws(
      () => services.articles.update(account.id, 999, { title: '不存在' }),
      (error) => expectStatus(error, 404),
    );
    assert.throws(() => services.blog.accountArticles('nobody'), (error) => expectStatus(error, 404));
  } finally {
    cleanup();
  }
});

test('账号删除：主库记录与文章库文件一起清理', () => {
  const { app, cleanup } = createTestApp();
  try {
    const { services } = app;
    const account = services.accounts.create({ username: 'temp', nickname: '临时账号' });
    services.articles.create(account.id, { title: '临时文章', status: 'published' });
    const accountFile = path.join(app.config.dataDir, 'accounts', `account-${account.id}.db`);
    assert.ok(fs.existsSync(accountFile));

    services.accounts.remove(account.id);
    assert.ok(!fs.existsSync(accountFile), '删除账号时应删除文章库文件');
    assert.throws(() => services.accounts.getById(account.id), (error) => expectStatus(error, 404));
    assert.equal(services.blog.getStats().accounts, 0);
  } finally {
    cleanup();
  }
});
