import { createApp } from '../src/app.js';

/**
 * 种子数据：创建两个演示账号（各自一个文章库）+ 几篇演示文章。
 * 幂等：账号已存在就复用；账号下已有文章就不重复写入。
 *
 * 用法：npm run seed
 */
const app = createApp();
const { services, db } = app;

const accountsSeed = [
  {
    username: 'jk',
    nickname: 'DaoDun',
    bio: '站长。写代码，也写点字。',
    articles: [
      {
        title: '从零搭一个博客地基：Node.js + SQLite',
        summary: '主库存账号，账号库存文章：先把手感最要紧的数据库层与第一页搭起来。',
        tags: ['工程', 'Node.js', 'SQLite'],
        status: 'published',
        content: [
          '## 为什么要先搭地基',
          '',
          '博客的地基其实就三件事：**数据放在哪、怎么按账号隔离、页面从哪里读数据**。',
          '',
          '## 分库设计',
          '',
          '主库只做两件事：登记账号、存站点配置。文章则各自回家，每个账号一个独立的 SQLite 文件：',
          '',
          '```text',
          'data/',
          '├── master.db              # 主库：账号索引 + 站点配置',
          '└── accounts/',
          '    ├── account-1.db       # 账号 1 的文章库（articles 表）',
          '    └── account-2.db       # 账号 2 的文章库',
          '```',
          '',
          '天然隔离，删账号只要删文件，备份也可以按账号单独拿出来。',
          '',
          '## 下一步',
          '',
          '- 看板娘起始页接入文章列表；',
          '- 补上写作界面与权限；',
          '- 再加评论、RSS 之类的常规功能。',
        ].join('\n'),
      },
      {
        title: '在代码与星光之间',
        summary: '写给深夜还亮着的那块屏幕。',
        tags: ['随笔', '星光'],
        status: 'published',
        content: [
          '夜里的屏幕有一点像窗户。',
          '',
          '窗外是星光，窗内是光标。你敲下一行字，它就在某台机器的 SQLite 文件里安了家。',
          '',
          '> 写博客这件事，未必是为了被看见，有时候只是想给当时的自己留一盏灯。',
          '',
          '晚安，明天继续。',
        ].join('\n'),
      },
      {
        title: '给文章库加索引的三种思路',
        summary: '草稿：记录一下按状态、时间、关键词检索的索引设计。',
        tags: ['草稿', '数据库'],
        status: 'draft',
        content: [
          '这篇先放草稿箱：',
          '',
          '1. `(status, published_at DESC)` —— 首页 Feed 按发布时间取已发布文章；',
          '2. `(updated_at DESC)` —— 后台列表按更新时间排序；',
          '3. 关键词检索先用 `LIKE`，数据量上来以后换 FTS5。',
        ].join('\n'),
      },
    ],
  },
  {
    username: 'xiaoxing',
    nickname: '小星',
    bio: '本站看板娘，负责卖萌和催更。',
    articles: [
      {
        title: '看板娘的第一封信',
        summary: '第一次站在起始页上，有一点紧张，请多关照。',
        tags: ['随笔', '看板娘'],
        status: 'published',
        content: [
          '你好呀，我是小星。',
          '',
          '从今天起，我会站在这个小站的起始页上。你每次打开它，我都在这里。',
          '',
          '- 如果你看见我，说明数据都好好地待在各自的账号库里；',
          '- 如果我旁边空空的，说明背景图还没换，记得看一下图片规格哦。',
          '',
          '请多关照。',
        ].join('\n'),
      },
      {
        title: '今天也要好好写博客',
        summary: '催更提醒：不必每天长篇大论，写一句也算数。',
        tags: ['日常', '催更'],
        status: 'published',
        content: [
          '写博客最难的从来不是排版，是打开编辑器的那一下。',
          '',
          '所以今天的建议是：**只写一句话也可以**。',
          '',
          '1. 打开编辑器；',
          '2. 写一句今天想说的话；',
          '3. 保存成草稿也算赢。',
          '',
          '我在起始页等你。',
        ].join('\n'),
      },
    ],
  },
];

function getAccount(username) {
  try {
    return services.accounts.getByUsername(username);
  } catch {
    return null;
  }
}

function writeArticle(account, input) {
  const article = services.articles.create(account.id, input);
  return article;
}

console.log('');
console.log('  ✦ 正在写入种子数据…');
console.log('');

let createdAccounts = 0;
let createdArticles = 0;

for (const seed of accountsSeed) {
  let account = getAccount(seed.username);
  if (!account) {
    account = services.accounts.create({
      username: seed.username,
      nickname: seed.nickname,
      bio: seed.bio,
    });
    createdAccounts += 1;
    console.log(`  + 账号 @${account.username}（${account.nickname}）→ accounts/account-${account.id}.db`);
  } else {
    console.log(`  = 账号 @${account.username} 已存在，跳过创建`);
  }

  const existing = services.articles.list(account.id, { limit: 1 }).total;
  if (existing > 0) {
    console.log(`    · 该账号已有 ${existing} 篇文章，跳过种子文章`);
    continue;
  }

  for (const article of seed.articles) {
    const saved = writeArticle(account, article);
    createdArticles += 1;
    console.log(`    · 写入《${saved.title}》[${saved.status}]`);
  }
}

const stats = services.blog.getStats();
console.log('');
console.log(
  `  ✦ 完成：新增账号 ${createdAccounts} 个、文章 ${createdArticles} 篇；当前共 ${stats.accounts} 个账号 / ${stats.articles} 篇文章（已发布 ${stats.published} 篇）。`,
);
console.log('');
console.log(`  ✦ 数据目录：${app.config.dataDir}`);
console.log('  ✦ 启动预览：npm start  →  http://127.0.0.1:4173/');
console.log('');

app.close();
