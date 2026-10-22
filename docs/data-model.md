# 数据模型

当前采用「**主库 + 每账号一个文章库**」的 SQLite 结构。没有登录/鉴权，账号只作为文章分库的归属维度。

## 总览

```text
data/
├─ master.db                  # 主库
│  ├─ accounts                # 账号索引
│  ├─ site_settings           # 站点配置（key-value）
│  └─ PRAGMA user_version = 1
└─ accounts/
   ├─ account-1.db            # 账号 1 的文章库
   │  ├─ articles             # 文章表
   │  └─ PRAGMA user_version = 1
   └─ account-2.db            # 账号 2 的文章库
      └─ ...
```

为什么这样分：

- **隔离**：不同账号的文章物理分开，不会互相污染，列表/检索也不会串库。
- **可迁移**：备份、导出、删除某个账号，只需要操作它自己的 `.db` 文件。
- **可扩展**：以后给账号加分类、草稿箱、媒体等表，改动局限在账号库内部。

## 主库 `master.db`

### accounts

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | 账号 ID |
| `username` | TEXT NOT NULL UNIQUE | 账号名（小写字母开头，2–24 位字母/数字/下划线），用于 URL |
| `nickname` | TEXT NOT NULL | 展示昵称 |
| `bio` | TEXT NOT NULL DEFAULT '' | 简介 |
| `avatar` | TEXT NOT NULL DEFAULT '' | 头像地址（暂未使用，预留） |
| `created_at` | TEXT NOT NULL | ISO 时间 |
| `updated_at` | TEXT NOT NULL | ISO 时间 |

> 目前没有密码字段。等以后需要登录时，在 `accounts` 上加 `password_hash` / 第三方登录关联表即可，文章库和页面数据结构不需要变。

### site_settings

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | TEXT PRIMARY KEY | 配置项 |
| `value` | TEXT NOT NULL | 配置值 |
| `updated_at` | TEXT NOT NULL | ISO 时间 |

默认配置（首次启动写入，之后可在库里改）：

| key | 默认值 |
| --- | --- |
| `title` | `刀盾的小屋` |
| `subtitle` | `在代码与星光之间，写一点想写的东西。` |
| `description` | `一个用 Node.js 和 SQLite 写成的博客，记录代码、文字与一点星光。` |
| `owner` | `DaoDun` |
| `mascotName` | `小星` |
| `mascotLine` | `欢迎回来，今天也一起写点什么吧～` |
| `footer` | `© 2026 DaoDun · 用 SQLite 写下每一个字` |
| `aboutTitle` | `关于这个小站` |
| `aboutText` | `一个用 **Node.js + SQLite** 搭起来的个人博客：主库登记账号，每个账号拥有独立的文章库；前端原生 HTML / CSS / JavaScript，没有构建步骤。`（Markdown 文本） |
| `aboutTags` | `Node.js,SQLite,Vanilla JS,账号分库,零依赖`（逗号分隔，前端渲染成标签） |

> 「关于这个小站」已改为独立页面 `/about`（首页不再显示关于区块），它的标题、正文、技术标签仍保存在主库 `site_settings` 里，和站点标题、页脚等配置放在一起；改内容用 `node server/scripts/set-setting.js <key> <value>` 即可，不需要改前端。

> `mascotName` / `mascotLine` 仍然保留：首页的打字机问候使用 `mascotLine`（文字看板娘）；原先 AI 生成的占位立绘已按需求从页面移除，配置字段留着方便以后扩展。

## 账号库 `accounts/account-<id>.db`

### articles

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | 文章 ID（**在各自账号库内唯一**，不同账号可能有相同 id） |
| `title` | TEXT NOT NULL | 标题，1–200 字符（DB CHECK 兜底） |
| `slug` | TEXT NOT NULL UNIQUE | URL 标识；由标题生成，同标题自动追加 `-2`、`-3` |
| `summary` | TEXT NOT NULL DEFAULT '' | 摘要（Feed 卡片显示） |
| `content` | TEXT NOT NULL DEFAULT '' | 正文，Markdown 原文 |
| `cover` | TEXT NOT NULL DEFAULT '' | 封面图地址（预留） |
| `tags` | TEXT NOT NULL DEFAULT '[]' | JSON 字符串数组，最多 8 个，单个 ≤24 字符 |
| `status` | TEXT NOT NULL DEFAULT 'draft' | `draft` / `published`（DB CHECK 兜底） |
| `views` | INTEGER NOT NULL DEFAULT 0 | 阅读量（公开阅读接口累加） |
| `created_at` | TEXT NOT NULL | ISO 时间 |
| `updated_at` | TEXT NOT NULL | ISO 时间 |
| `published_at` | TEXT NULL | 首次/最近一次发布的时间；改回草稿会清空，Feed 按它倒序 |

索引：

```sql
CREATE INDEX idx_articles_status_published ON articles (status, published_at DESC);
CREATE INDEX idx_articles_updated ON articles (updated_at DESC);
```

## 生命周期

| 操作 | 行为 |
| --- | --- |
| 创建账号 | 主库插入 `accounts` 记录 → 自动创建 `accounts/account-<id>.db` 并建表。任一步失败会回滚，不留下半成品。 |
| 写文章 | 只写目标账号自己的库；`ArticleService` 负责校验、生成唯一 slug。 |
| 删除账号 | 先关闭并删除账号库文件（含 `-wal` / `-shm`），再删主库记录。 |
| 发布 / 取消发布 | 更新 `status` 和 `published_at`；草稿不会出现在公开接口和 Feed 里。 |
| 服务启动 | 打开主库并执行迁移、补齐默认站点配置；账号库按需惰性打开并缓存。 |

## Schema 版本与迁移

用 SQLite 内置的 `PRAGMA user_version` 记录版本：

- 主库、账号库当前都是 `1`。
- 打开数据库时如果版本低于代码内版本，会按顺序执行迁移；高于代码版本会直接报错，避免旧代码写新库。
- 以后加字段的姿势：新增 `SCHEMA_V2` + `if (version < 2) { ... }`，不要修改已发布的历史迁移。

代码位置：

- 主库：[`server/src/db/master.js`](../server/src/db/master.js)
- 账号库：[`server/src/db/account-dbs.js`](../server/src/db/account-dbs.js)
- 文章表与仓库：[`server/src/db/articles.js`](../server/src/db/articles.js)

## 快速查看数据

用 Node 自带的 `node:sqlite` 直接查（不需要安装 sqlite3 CLI）：

```powershell
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/master.db');console.log(db.prepare('select id,username,nickname from accounts').all());"
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/accounts/account-1.db');console.log(db.prepare('select id,title,status,published_at from articles').all());"
```

备份：停服后直接复制 `data/` 目录；或者单独复制某个账号的 `account-<id>.db`（WAL 模式下建议先停服，或同时复制 `-wal` / `-shm`）。

## 后续扩展建议

- **分类**：账号库里加 `categories` 表和 `articles.category_id`，不用动主库。
- **全文检索**：账号库里加 `articles_fts`（FTS5），对 `title/summary/content` 建索引。
- **登录与权限**：主库 `accounts` 加凭据字段；写接口复用现有 `ArticleService`，只补鉴权层。
- **评论**：可以按文章归属放在账号库，也可以单独建评论库；建议单独库，避免博客正文库频繁写锁。
- **媒体文件**：图片不要存进 SQLite BLOB（当前阶段），放 `web/uploads/` 或对象存储，库里存 URL。
