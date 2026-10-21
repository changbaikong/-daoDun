# HTTP API

当前阶段没有登录/注册，HTTP 层只提供**公开只读接口**。
写文章能力位于 `server/src/services/`（`AccountService` / `ArticleService`），后续接写接口时复用。

## 约定

- 基础地址：`http://127.0.0.1:4173`
- 请求 / 响应均为 JSON，`Content-Type: application/json; charset=utf-8`
- 成功：`200`（或特殊说明的 `201` / `204`）
- 失败：统一结构

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "文章不存在或尚未发布",
    "details": null
  }
}
```

| HTTP 状态 | code | 场景 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` / `INVALID_JSON` / `BAD_PATH` | 请求非法 |
| 404 | `NOT_FOUND` | 接口 / 账号 / 文章 / 页面不存在 |
| 405 | `METHOD_NOT_ALLOWED` | 方法不支持，`details.allowed` 会给出允许的方法 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过 1MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 请求体不是 JSON |
| 422 | `VALIDATION_ERROR` | 参数校验失败，`details` 是字段级错误 |
| 500 | `INTERNAL_ERROR` | 服务端异常 |

分页接口使用 `limit` / `offset`，默认 `limit=20`、`offset=0`。

## GET /api/health

```json
{ "ok": true, "service": "jk-blog", "version": "0.1.0", "time": "2026-10-21T03:37:47.241Z" }
```

## GET /api/site

站点配置（来自主库 `site_settings`）。

```json
{
  "site": {
    "title": "Jk 的博客",
    "subtitle": "在代码与星光之间，写一点想写的东西。",
    "description": "一个用 Node.js 和 SQLite 写成的博客，记录代码、文字与一点星光。",
    "owner": "Jk",
    "mascotName": "小星",
    "mascotLine": "欢迎回来，今天也一起写点什么吧～",
    "footer": "© 2026 Jk · 用 SQLite 写下每一个字"
  }
}
```

## GET /api/stats

```json
{ "accounts": 2, "articles": 5, "published": 4 }
```

## GET /api/feed?limit=8

跨账号的最新已发布文章，按 `publishedAt` 倒序；**不返回正文**，带 `excerpt` 供卡片展示。
`limit` 范围 1–20，默认 6。

```json
{
  "items": [
    {
      "id": 2,
      "title": "今天也要好好写博客",
      "slug": "post-mvhk9v9j-uu1g",
      "summary": "催更提醒：不必每天长篇大论，写一句也算数。",
      "excerpt": "写博客最难的从来不是排版，是打开编辑器的那一下。……",
      "cover": "",
      "tags": ["日常", "催更"],
      "views": 3,
      "status": "published",
      "publishedAt": "2026-10-21T03:37:22.101Z",
      "updatedAt": "2026-10-21T03:37:22.101Z",
      "author": {
        "id": 2,
        "username": "xiaoxing",
        "nickname": "小星",
        "avatar": ""
      }
    }
  ]
}
```

> `id` 是**账号库内的文章 ID**，跨账号不保证唯一；阅读单篇时需要同时提供 `username`。

## GET /api/accounts

账号列表 + 各自文章统计。

```json
{
  "items": [
    {
      "id": 1,
      "username": "jk",
      "nickname": "Jk",
      "avatar": "",
      "bio": "站长。写代码，也写点字。",
      "createdAt": "2026-10-21T03:37:20.227Z",
      "stats": { "articles": 3, "published": 2 }
    }
  ]
}
```

## GET /api/accounts/:username

```json
{
  "account": {
    "id": 2,
    "username": "xiaoxing",
    "nickname": "小星",
    "avatar": "",
    "bio": "本站看板娘，负责卖萌和催更。",
    "createdAt": "2026-10-21T03:37:20.322Z",
    "stats": { "articles": 2, "published": 2 }
  }
}
```

## GET /api/accounts/:username/articles?limit=12&offset=0

只返回该账号**已发布**的文章；`limit` 1–50，默认 10。

```json
{
  "account": { "...": "同上" },
  "items": [ { "id": 1, "title": "看板娘的第一封信", "tags": ["随笔"], "author": { "...": "" } } ]
}
```

## GET /api/public/articles/:username/:id

公开阅读单篇。仅 `published` 可见；每次请求 `views + 1`，响应里的 `views` 为累加后的值。

```json
{
  "article": {
    "id": 1,
    "title": "看板娘的第一封信",
    "slug": "post-mvhk9v9j-0a1b",
    "summary": "第一次站在起始页上，有一点紧张，请多关照。",
    "content": "你好呀，我是小星。\n\n从今天起……",
    "cover": "",
    "tags": ["随笔", "看板娘"],
    "status": "published",
    "views": 4,
    "createdAt": "2026-10-21T03:37:20.401Z",
    "updatedAt": "2026-10-21T03:37:20.401Z",
    "publishedAt": "2026-10-21T03:37:20.401Z"
  },
  "author": { "id": 2, "username": "xiaoxing", "nickname": "小星", "avatar": "" }
}
```

## 静态路由

| 路径 | 说明 |
| --- | --- |
| `/` | 看板娘起始页 |
| `/css/*`、`/js/*` | 样式与脚本 |
| `/assets/*` | 背景图、看板娘立绘、favicon |
| `/?post=<username>:<id>` | 前端文章深链，打开阅读弹窗 |
| 无扩展名路径 | 回退 `index.html`（方便以后加独立页面） |

## 示例

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/stats
Invoke-RestMethod "http://127.0.0.1:4173/api/feed?limit=4"
Invoke-RestMethod http://127.0.0.1:4173/api/public/articles/xiaoxing/1
```

```bash
curl http://127.0.0.1:4173/api/accounts
curl "http://127.0.0.1:4173/api/accounts/xiaoxing/articles?limit=5"
```

## 尚未开放（后续阶段）

- `POST /api/articles`、`PATCH /api/articles/:id`、`DELETE /api/articles/:id`：写接口，直接复用 `ArticleService`。
- 登录 / 权限：目前账号不需要密码，接口全部公开只读。
- 图片上传、评论、RSS 等。

这些在加之前，写文章请使用种子脚本或 Node 调用服务层（见 README「后端库怎么用」）。
